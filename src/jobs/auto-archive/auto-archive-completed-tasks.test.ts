import { ActivityType, AssigneeType } from '@prisma/client'

// Mocks must be configured before requiring the SUT. Variables referenced inside the
// jest.mock factory must start with `mock` so the babel-jest allow-list lets the closure
// see them once the const declarations have run.
const mockQueryRaw = jest.fn()
const mockActivityLogCreateMany = jest.fn()

jest.mock('@trigger.dev/sdk/v3', () => ({
  schedules: {
    task: ({ run }: { run: (payload: unknown, ctx?: unknown) => unknown }) => ({ run }),
  },
  logger: { log: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      $queryRaw: mockQueryRaw,
      activityLog: { createMany: mockActivityLogCreateMany },
    }),
  },
}))

import { autoArchiveCompletedTasks } from './auto-archive-completed-tasks'

type RunResult = { totalArchived: number; workspaceCount: number }
const runJob = async (): Promise<RunResult> => {
  const { run } = autoArchiveCompletedTasks as unknown as {
    run: (payload: { timestamp: Date }) => Promise<RunResult>
  }
  return run({ timestamp: new Date() })
}

describe('autoArchiveCompletedTasks', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockQueryRaw.mockReset()
    mockActivityLogCreateMany.mockReset()
  })

  it('exits cleanly when no workspace has auto-archive enabled', async () => {
    mockQueryRaw.mockResolvedValueOnce([])

    const result = await runJob()

    expect(result).toEqual({ totalArchived: 0, workspaceCount: 0 })
    expect(mockActivityLogCreateMany).not.toHaveBeenCalled()
  })

  it('skips a workspace when the first archive batch returns no rows', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ workspaceId: 'ws1', autoArchiveAfterDays: 7 }]).mockResolvedValueOnce([])

    const result = await runJob()

    expect(result).toEqual({ totalArchived: 0, workspaceCount: 1 })
    expect(mockActivityLogCreateMany).not.toHaveBeenCalled()
  })

  it('writes activity logs marked as system-initiated for archived tasks', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ workspaceId: 'ws1', autoArchiveAfterDays: 7 }])
      .mockResolvedValueOnce([{ id: 't1' }, { id: 't2' }])
      .mockResolvedValueOnce([])

    const result = await runJob()

    expect(result).toEqual({ totalArchived: 2, workspaceCount: 1 })
    expect(mockActivityLogCreateMany).toHaveBeenCalledTimes(1)
    const data = mockActivityLogCreateMany.mock.calls[0][0].data as Array<Record<string, unknown>>
    expect(data).toHaveLength(2)
    expect(data[0]).toMatchObject({
      taskId: 't1',
      workspaceId: 'ws1',
      type: ActivityType.ARCHIVE_STATE_UPDATED,
      details: { oldValue: false, newValue: true },
      userId: null,
      userRole: AssigneeType.internalUser,
    })
    expect(data[1]).toMatchObject({ taskId: 't2', userId: null })
  })

  it('continues paging through batches until one comes back empty', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ workspaceId: 'ws1', autoArchiveAfterDays: 7 }])
      .mockResolvedValueOnce([{ id: 'a' }])
      .mockResolvedValueOnce([{ id: 'b' }])
      .mockResolvedValueOnce([])

    const result = await runJob()

    expect(result.totalArchived).toBe(2)
    expect(mockActivityLogCreateMany).toHaveBeenCalledTimes(2)
  })

  it('processes multiple workspaces independently', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([
        { workspaceId: 'ws1', autoArchiveAfterDays: 7 },
        { workspaceId: 'ws2', autoArchiveAfterDays: 30 },
      ])
      .mockResolvedValueOnce([{ id: 'a' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'b' }])
      .mockResolvedValueOnce([])

    const result = await runJob()

    expect(result).toEqual({ totalArchived: 2, workspaceCount: 2 })
    const workspaceIds = mockActivityLogCreateMany.mock.calls.map(
      (call) => (call[0].data[0] as { workspaceId: string }).workspaceId,
    )
    expect(workspaceIds).toEqual(['ws1', 'ws2'])
  })

  it('isolates per-workspace failures so other workspaces still archive', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([
        { workspaceId: 'ws-bad', autoArchiveAfterDays: 7 },
        { workspaceId: 'ws-good', autoArchiveAfterDays: 7 },
      ])
      .mockRejectedValueOnce(new Error('DB blew up'))
      .mockResolvedValueOnce([{ id: 'g1' }])
      .mockResolvedValueOnce([])

    const result = await runJob()

    expect(result).toEqual({ totalArchived: 1, workspaceCount: 2 })
    expect(mockActivityLogCreateMany).toHaveBeenCalledTimes(1)
    expect(mockActivityLogCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ taskId: 'g1', workspaceId: 'ws-good' })]),
      }),
    )
  })

  it('does not abort the sweep when activity log creation fails for one workspace', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([
        { workspaceId: 'ws-bad', autoArchiveAfterDays: 7 },
        { workspaceId: 'ws-good', autoArchiveAfterDays: 7 },
      ])
      .mockResolvedValueOnce([{ id: 'b1' }])
      .mockResolvedValueOnce([{ id: 'g1' }])
      .mockResolvedValueOnce([])
    mockActivityLogCreateMany.mockRejectedValueOnce(new Error('Write failed')).mockResolvedValueOnce(undefined)

    const result = await runJob()

    expect(result).toEqual({ totalArchived: 1, workspaceCount: 2 })
    expect(mockActivityLogCreateMany).toHaveBeenCalledTimes(2)
  })
})
