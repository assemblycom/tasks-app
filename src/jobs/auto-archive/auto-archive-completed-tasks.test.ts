import { ActivityType, AssigneeType } from '@prisma/client'

// Mocks must be configured before requiring the SUT. Variables referenced inside the
// jest.mock factory must start with `mock` so the babel-jest allow-list lets the closure
// see them once the const declarations have run.
const mockQueryRaw = jest.fn()
const mockTaskFindMany = jest.fn()
const mockActivityLogCreateMany = jest.fn()
const mockDispatchWebhook = jest.fn()
const mockSerialize = jest.fn(async (task: { id: string }) => ({ id: task.id }))

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
      task: { findMany: mockTaskFindMany },
      activityLog: { createMany: mockActivityLogCreateMany },
    }),
  },
}))

jest.mock('@/utils/CopilotAPI', () => ({
  __esModule: true,
  CopilotAPI: jest.fn().mockImplementation(() => ({
    dispatchWebhook: mockDispatchWebhook,
  })),
}))

jest.mock('@/app/api/tasks/public/public.serializer', () => ({
  __esModule: true,
  // Wrap in a function so the `mockSerialize` reference resolves at call time, not at
  // factory-evaluation time (which happens during SUT import, before this file's const
  // declarations have run — direct references would hit a TDZ error).
  PublicTaskSerializer: { serialize: (...args: unknown[]) => mockSerialize(...(args as [{ id: string }])) },
}))

// Bypass Bottleneck's rate-limiting in tests — schedule(fn) just runs fn immediately.
// Real rate-limit behavior would slow tests by ~250ms × N without changing what we assert.
jest.mock('bottleneck', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    schedule: <T>(fn: () => Promise<T>) => fn(),
  })),
}))

import { autoArchiveCompletedTasks } from './auto-archive-completed-tasks'

type RunResult = { totalArchived: number; workspaceCount: number }
const runJob = async (): Promise<RunResult> => {
  const { run } = autoArchiveCompletedTasks as unknown as {
    run: (payload: { timestamp: Date }) => Promise<RunResult>
  }
  return run({ timestamp: new Date() })
}

const archivedTaskRow = (id: string) => ({ id, workflowState: {}, attachments: [] })

describe('autoArchiveCompletedTasks', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockQueryRaw.mockReset()
    mockTaskFindMany.mockReset()
    mockActivityLogCreateMany.mockReset()
    mockDispatchWebhook.mockReset()
    mockSerialize.mockClear()
    mockSerialize.mockImplementation(async (task: { id: string }) => ({ id: task.id }))
  })

  it('exits cleanly when no workspace has auto-archive enabled', async () => {
    mockQueryRaw.mockResolvedValueOnce([])

    const result = await runJob()

    expect(result).toEqual({ totalArchived: 0, workspaceCount: 0 })
    expect(mockActivityLogCreateMany).not.toHaveBeenCalled()
    expect(mockTaskFindMany).not.toHaveBeenCalled()
    expect(mockDispatchWebhook).not.toHaveBeenCalled()
  })

  it('skips a workspace when the first archive batch returns no rows', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ workspaceId: 'ws1', autoArchiveAfterDays: 7 }]).mockResolvedValueOnce([])

    const result = await runJob()

    expect(result).toEqual({ totalArchived: 0, workspaceCount: 1 })
    expect(mockActivityLogCreateMany).not.toHaveBeenCalled()
    expect(mockTaskFindMany).not.toHaveBeenCalled()
    expect(mockDispatchWebhook).not.toHaveBeenCalled()
  })

  it('writes activity logs marked as system-initiated for archived tasks', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ workspaceId: 'ws1', autoArchiveAfterDays: 7 }])
      .mockResolvedValueOnce([{ id: 't1' }, { id: 't2' }])
      .mockResolvedValueOnce([])
    mockTaskFindMany.mockResolvedValueOnce([archivedTaskRow('t1'), archivedTaskRow('t2')])
    mockDispatchWebhook.mockResolvedValue(undefined)

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

  it('dispatches a task.archived webhook for every archived task in the batch', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ workspaceId: 'ws1', autoArchiveAfterDays: 7 }])
      .mockResolvedValueOnce([{ id: 't1' }, { id: 't2' }])
      .mockResolvedValueOnce([])
    mockTaskFindMany.mockResolvedValueOnce([archivedTaskRow('t1'), archivedTaskRow('t2')])
    mockDispatchWebhook.mockResolvedValue(undefined)

    await runJob()

    expect(mockDispatchWebhook).toHaveBeenCalledTimes(2)
    expect(mockDispatchWebhook).toHaveBeenCalledWith('task.archived', {
      workspaceId: 'ws1',
      payload: { id: 't1' },
    })
    expect(mockDispatchWebhook).toHaveBeenCalledWith('task.archived', {
      workspaceId: 'ws1',
      payload: { id: 't2' },
    })
  })

  it('looks up archived tasks with workflowState and attachments for serialization', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ workspaceId: 'ws1', autoArchiveAfterDays: 7 }])
      .mockResolvedValueOnce([{ id: 't1' }])
      .mockResolvedValueOnce([])
    mockTaskFindMany.mockResolvedValueOnce([archivedTaskRow('t1')])
    mockDispatchWebhook.mockResolvedValue(undefined)

    await runJob()

    expect(mockTaskFindMany).toHaveBeenCalledTimes(1)
    expect(mockTaskFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['t1'] } },
      include: { workflowState: true, attachments: true },
    })
  })

  it('continues paging through batches until one comes back empty', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ workspaceId: 'ws1', autoArchiveAfterDays: 7 }])
      .mockResolvedValueOnce([{ id: 'a' }])
      .mockResolvedValueOnce([{ id: 'b' }])
      .mockResolvedValueOnce([])
    mockTaskFindMany.mockResolvedValueOnce([archivedTaskRow('a')]).mockResolvedValueOnce([archivedTaskRow('b')])
    mockDispatchWebhook.mockResolvedValue(undefined)

    const result = await runJob()

    expect(result.totalArchived).toBe(2)
    expect(mockActivityLogCreateMany).toHaveBeenCalledTimes(2)
    expect(mockDispatchWebhook).toHaveBeenCalledTimes(2)
  })

  it('processes multiple workspaces independently and tags each webhook with its workspace', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([
        { workspaceId: 'ws1', autoArchiveAfterDays: 7 },
        { workspaceId: 'ws2', autoArchiveAfterDays: 30 },
      ])
      .mockResolvedValueOnce([{ id: 'a' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'b' }])
      .mockResolvedValueOnce([])
    mockTaskFindMany.mockResolvedValueOnce([archivedTaskRow('a')]).mockResolvedValueOnce([archivedTaskRow('b')])
    mockDispatchWebhook.mockResolvedValue(undefined)

    const result = await runJob()

    expect(result).toEqual({ totalArchived: 2, workspaceCount: 2 })
    const workspaceIdsOnDispatch = mockDispatchWebhook.mock.calls.map(
      (call) => (call[1] as { workspaceId: string }).workspaceId,
    )
    expect(workspaceIdsOnDispatch).toEqual(['ws1', 'ws2'])
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
    mockTaskFindMany.mockResolvedValueOnce([archivedTaskRow('g1')])
    mockDispatchWebhook.mockResolvedValue(undefined)

    const result = await runJob()

    expect(result).toEqual({ totalArchived: 1, workspaceCount: 2 })
    expect(mockActivityLogCreateMany).toHaveBeenCalledTimes(1)
    expect(mockActivityLogCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ taskId: 'g1', workspaceId: 'ws-good' })]),
      }),
    )
    expect(mockDispatchWebhook).toHaveBeenCalledTimes(1)
    expect(mockDispatchWebhook).toHaveBeenCalledWith('task.archived', {
      workspaceId: 'ws-good',
      payload: { id: 'g1' },
    })
  })

  it('does not abort the sweep when a single webhook dispatch throws', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ workspaceId: 'ws1', autoArchiveAfterDays: 7 }])
      .mockResolvedValueOnce([{ id: 't1' }, { id: 't2' }])
      .mockResolvedValueOnce([])
    mockTaskFindMany.mockResolvedValueOnce([archivedTaskRow('t1'), archivedTaskRow('t2')])
    mockDispatchWebhook.mockRejectedValueOnce(new Error('Network blip')).mockResolvedValueOnce(undefined)

    const result = await runJob()

    expect(result.totalArchived).toBe(2)
    expect(mockDispatchWebhook).toHaveBeenCalledTimes(2)
  })

  it('does not abort the sweep when serializer throws for one task', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ workspaceId: 'ws1', autoArchiveAfterDays: 7 }])
      .mockResolvedValueOnce([{ id: 't1' }, { id: 't2' }])
      .mockResolvedValueOnce([])
    mockTaskFindMany.mockResolvedValueOnce([archivedTaskRow('t1'), archivedTaskRow('t2')])
    mockSerialize.mockImplementationOnce(async () => {
      throw new Error('Bad payload')
    })
    mockDispatchWebhook.mockResolvedValue(undefined)

    const result = await runJob()

    expect(result.totalArchived).toBe(2)
    // Only one webhook fires — the task whose serialization failed never gets to dispatch.
    expect(mockDispatchWebhook).toHaveBeenCalledTimes(1)
    expect(mockDispatchWebhook).toHaveBeenCalledWith('task.archived', {
      workspaceId: 'ws1',
      payload: { id: 't2' },
    })
  })
})
