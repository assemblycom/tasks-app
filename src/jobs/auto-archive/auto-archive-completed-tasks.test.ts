import { ActivityType, AssigneeType } from '@prisma/client'

// Mocks must be configured before requiring the SUT. Variables referenced inside the
// jest.mock factory must start with `mock` so the babel-jest allow-list lets the closure
// see them once the const declarations have run.
const mockQueryRaw = jest.fn()
const mockActivityLogCreateMany = jest.fn()
const mockTransaction = jest.fn()
const mockBatchTrigger = jest.fn()

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
      $transaction: mockTransaction,
      activityLog: { createMany: mockActivityLogCreateMany },
    }),
  },
}))

// Stub the dispatcher task — the cron should call `.batchTrigger`, not own webhook
// delivery itself. A real Trigger.dev task object exposes more methods; we only assert on
// what the cron actually invokes.
jest.mock('./dispatch-task-archived-webhook', () => ({
  __esModule: true,
  dispatchTaskArchivedWebhook: {
    batchTrigger: (...args: unknown[]) => mockBatchTrigger(...args),
  },
}))

// Bypass Bottleneck's rate-limiting in tests but preserve sequential ordering per instance
// via a promise chain. Workspace-level parallelism would race the FIFO mockResolvedValueOnce
// queue and produce nondeterministic ordering; per-instance chaining mirrors
// `maxConcurrent: 1` real behavior, which is what the assertions assume.
jest.mock('bottleneck', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => {
    let chain: Promise<unknown> = Promise.resolve()
    return {
      schedule: <T>(fn: () => Promise<T>) => {
        const next = chain.then(() => fn())
        chain = next.catch(() => undefined)
        return next
      },
    }
  }),
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
    mockTransaction.mockReset()
    mockBatchTrigger.mockReset()

    // $transaction(cb) runs cb with a tx client. Real Prisma transactions don't change
    // query semantics — they make commit atomic — so the mock just passes the same
    // queryRaw/createMany mocks through, letting tests drive batch responses normally.
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({ $queryRaw: mockQueryRaw, activityLog: { createMany: mockActivityLogCreateMany } }),
    )
    mockBatchTrigger.mockResolvedValue({ batchId: 'b1' })
  })

  it('exits cleanly when no workspace has eligible tasks', async () => {
    mockQueryRaw.mockResolvedValueOnce([])

    const result = await runJob()

    expect(result).toEqual({ totalArchived: 0, workspaceCount: 0 })
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockActivityLogCreateMany).not.toHaveBeenCalled()
    expect(mockBatchTrigger).not.toHaveBeenCalled()
  })

  it('skips a workspace when the first archive batch returns no rows', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ workspaceId: 'ws1', autoArchiveAfterDays: 7, taskCount: 3, parentCount: 2 }])
      .mockResolvedValueOnce([])

    const result = await runJob()

    expect(result).toEqual({ totalArchived: 0, workspaceCount: 1 })
    expect(mockActivityLogCreateMany).not.toHaveBeenCalled()
    expect(mockBatchTrigger).not.toHaveBeenCalled()
  })

  it('writes activity logs marked as system-initiated for archived tasks', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ workspaceId: 'ws1', autoArchiveAfterDays: 7, taskCount: 2, parentCount: 2 }])
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

  it('archives + activity logs run inside a single $transaction', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ workspaceId: 'ws1', autoArchiveAfterDays: 7, taskCount: 1, parentCount: 1 }])
      .mockResolvedValueOnce([{ id: 't1' }])
      .mockResolvedValueOnce([])

    await runJob()

    // Once for the archive batch (which contained tasks), and the empty terminator batch
    // also opens a transaction (its CTE runs but returns 0 rows, exiting the loop).
    expect(mockTransaction).toHaveBeenCalledTimes(2)
  })

  it('enqueues a dispatcher task for every archived task in the batch (parents + descendants)', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ workspaceId: 'ws1', autoArchiveAfterDays: 7, taskCount: 4, parentCount: 1 }])
      .mockResolvedValueOnce([{ id: 'parent' }, { id: 'child1' }, { id: 'child2' }, { id: 'grandchild' }])
      .mockResolvedValueOnce([])

    const result = await runJob()

    expect(result.totalArchived).toBe(4)
    expect(mockBatchTrigger).toHaveBeenCalledTimes(1)
    expect(mockBatchTrigger).toHaveBeenCalledWith([
      { payload: { taskId: 'parent', workspaceId: 'ws1' } },
      { payload: { taskId: 'child1', workspaceId: 'ws1' } },
      { payload: { taskId: 'child2', workspaceId: 'ws1' } },
      { payload: { taskId: 'grandchild', workspaceId: 'ws1' } },
    ])
  })

  it('continues paging through batches until one comes back empty', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([{ workspaceId: 'ws1', autoArchiveAfterDays: 7, taskCount: 2, parentCount: 2 }])
      .mockResolvedValueOnce([{ id: 'a' }])
      .mockResolvedValueOnce([{ id: 'b' }])
      .mockResolvedValueOnce([])

    const result = await runJob()

    expect(result.totalArchived).toBe(2)
    expect(mockActivityLogCreateMany).toHaveBeenCalledTimes(2)
    expect(mockBatchTrigger).toHaveBeenCalledTimes(2)
  })

  it('processes multiple workspaces independently and tags each enqueue with its workspace', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([
        { workspaceId: 'ws1', autoArchiveAfterDays: 7, taskCount: 1, parentCount: 1 },
        { workspaceId: 'ws2', autoArchiveAfterDays: 30, taskCount: 1, parentCount: 1 },
      ])
      .mockResolvedValueOnce([{ id: 'a' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'b' }])
      .mockResolvedValueOnce([])

    const result = await runJob()

    expect(result).toEqual({ totalArchived: 2, workspaceCount: 2 })
    const enqueuedWorkspaces = mockBatchTrigger.mock.calls.map(
      (call) => (call[0] as Array<{ payload: { workspaceId: string } }>)[0].payload.workspaceId,
    )
    expect(enqueuedWorkspaces).toEqual(['ws1', 'ws2'])
  })

  it('isolates per-workspace failures so other workspaces still archive', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([
        { workspaceId: 'ws-bad', autoArchiveAfterDays: 7, taskCount: 1, parentCount: 1 },
        { workspaceId: 'ws-good', autoArchiveAfterDays: 7, taskCount: 1, parentCount: 1 },
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
    expect(mockBatchTrigger).toHaveBeenCalledTimes(1)
    expect(mockBatchTrigger).toHaveBeenCalledWith([{ payload: { taskId: 'g1', workspaceId: 'ws-good' } }])
  })

  it('continues the sweep when batchTrigger throws — archive is already durable', async () => {
    mockQueryRaw
      .mockResolvedValueOnce([
        { workspaceId: 'ws1', autoArchiveAfterDays: 7, taskCount: 1, parentCount: 1 },
        { workspaceId: 'ws2', autoArchiveAfterDays: 7, taskCount: 1, parentCount: 1 },
      ])
      .mockResolvedValueOnce([{ id: 't1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 't2' }])
      .mockResolvedValueOnce([])
    mockBatchTrigger.mockRejectedValueOnce(new Error('Trigger.dev unreachable')).mockResolvedValueOnce({ batchId: 'b2' })

    const result = await runJob()

    // Both archives + activity logs persist regardless of dispatcher enqueue outcome.
    expect(result.totalArchived).toBe(2)
    expect(mockActivityLogCreateMany).toHaveBeenCalledTimes(2)
    expect(mockBatchTrigger).toHaveBeenCalledTimes(2)
  })
})
