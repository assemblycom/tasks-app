const mockSendTaskCreateNotifications = jest.fn()

jest.mock('@trigger.dev/sdk/v3', () => ({
  task: (config: Record<string, unknown>) => config,
  logger: { log: jest.fn() },
}))

jest.mock('@api/tasks/task-notifications.service', () => ({
  TaskNotificationsService: jest.fn().mockImplementation(() => ({
    sendTaskCreateNotifications: (...args: unknown[]) => mockSendTaskCreateNotifications(...args),
  })),
}))

import { sendTaskCreateNotifications } from './send-task-create-notifications'

type Run = (payload: { user: unknown; task: { id: string } }, ctx: unknown) => Promise<unknown>

const runTask = (payload: { user: unknown; task: { id: string } }) =>
  (sendTaskCreateNotifications as unknown as { run: Run }).run(payload, { ctx: { runId: 'run_1' } })

describe('sendTaskCreateNotifications job', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSendTaskCreateNotifications.mockReset()
  })

  it('opts into retries for transient database and notification failures', () => {
    expect(sendTaskCreateNotifications).toMatchObject({
      id: 'send-task-create-notifications',
      retry: {
        maxAttempts: 3,
        factor: 2,
        minTimeoutInMs: 1_000,
        maxTimeoutInMs: 15_000,
        randomize: true,
      },
    })
  })

  it('rethrows failures so Trigger.dev can apply the retry policy', async () => {
    mockSendTaskCreateNotifications.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(runTask({ user: {}, task: { id: 'task_1' } })).rejects.toThrow('database unavailable')
  })
})
