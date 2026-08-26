const mockQueryRaw = jest.fn()
const mockExecuteRaw = jest.fn()
const mockEnqueue = jest.fn()

jest.mock('@trigger.dev/sdk/v3', () => ({
  schedules: { task: ({ run }: { run: () => unknown }) => ({ run }) },
  logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
}))

jest.mock('./flush-grouped-email', () => ({
  enqueueGroupedEmailFlush: (...args: unknown[]) => mockEnqueue(...args),
}))

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
      $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
    }),
  },
}))

import { sweepGroupedEmailWindowsRun } from './sweep-grouped-email-windows'

describe('sweepGroupedEmailWindows', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockExecuteRaw.mockResolvedValueOnce(3).mockResolvedValueOnce(1)
  })

  it('re-enqueues every stale window and reports what it pruned', async () => {
    mockQueryRaw.mockResolvedValue([
      { workspaceId: 'ws_1', windowKey: 'client_1:win_1' },
      { workspaceId: 'ws_2', windowKey: 'iu_1:iu:win_2' },
    ])

    await expect(sweepGroupedEmailWindowsRun()).resolves.toEqual({ requeued: 2, released: 1, pruned: 3 })
    expect(mockEnqueue.mock.calls.map(([payload]) => payload)).toEqual([
      { workspaceId: 'ws_1', windowKey: 'client_1:win_1' },
      { workspaceId: 'ws_2', windowKey: 'iu_1:iu:win_2' },
    ])
  })

  it('prunes and releases stale claims without enqueueing when no window is stale', async () => {
    mockQueryRaw.mockResolvedValue([])

    await expect(sweepGroupedEmailWindowsRun()).resolves.toEqual({ requeued: 0, released: 1, pruned: 3 })
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2)
    expect(mockEnqueue).not.toHaveBeenCalled()
  })
})
