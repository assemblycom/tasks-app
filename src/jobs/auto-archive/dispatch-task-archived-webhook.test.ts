const mockTaskFindFirst = jest.fn()
const mockDispatchWebhook = jest.fn()
const mockSerialize = jest.fn(async (task: { id: string }) => ({ id: task.id }))

jest.mock('@trigger.dev/sdk/v3', () => ({
  task: ({ run }: { run: (payload: unknown) => unknown }) => ({ run }),
  logger: { log: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({ task: { findFirst: mockTaskFindFirst } }),
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
  PublicTaskSerializer: { serialize: (...args: unknown[]) => mockSerialize(...(args as [{ id: string }])) },
}))

import { dispatchTaskArchivedWebhook } from './dispatch-task-archived-webhook'

type Run = (payload: { taskId: string; workspaceId: string }) => Promise<unknown>
const runTask = (taskId: string, workspaceId: string) =>
  (dispatchTaskArchivedWebhook as unknown as { run: Run }).run({ taskId, workspaceId })

describe('dispatchTaskArchivedWebhook', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTaskFindFirst.mockReset()
    mockDispatchWebhook.mockReset()
    mockSerialize.mockClear()
    mockSerialize.mockImplementation(async (task: { id: string }) => ({ id: task.id }))
  })

  it('serializes the task and dispatches a task.archived webhook', async () => {
    mockTaskFindFirst.mockResolvedValueOnce({ id: 't1', workflowState: {}, attachments: [] })
    mockDispatchWebhook.mockResolvedValueOnce(undefined)

    const result = await runTask('t1', 'ws1')

    expect(mockTaskFindFirst).toHaveBeenCalledWith({
      where: { id: 't1' },
      include: { workflowState: true, attachments: true },
    })
    expect(mockDispatchWebhook).toHaveBeenCalledWith('task.archived', {
      workspaceId: 'ws1',
      payload: { id: 't1' },
    })
    expect(result).toEqual({ skipped: false, taskId: 't1', workspaceId: 'ws1' })
  })

  it('skips silently when the task no longer exists (hard-deleted between archive and dispatch)', async () => {
    mockTaskFindFirst.mockResolvedValueOnce(null)

    const result = await runTask('gone', 'ws1')

    expect(mockDispatchWebhook).not.toHaveBeenCalled()
    expect(result).toEqual({ skipped: true, taskId: 'gone', workspaceId: 'ws1' })
  })

  it('lets webhook failures throw so Trigger.dev retries', async () => {
    mockTaskFindFirst.mockResolvedValueOnce({ id: 't1', workflowState: {}, attachments: [] })
    mockDispatchWebhook.mockRejectedValueOnce(new Error('Copilot 429'))

    await expect(runTask('t1', 'ws1')).rejects.toThrow('Copilot 429')
  })
})
