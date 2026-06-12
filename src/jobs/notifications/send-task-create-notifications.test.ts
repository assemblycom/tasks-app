import { TaskWithWorkflowState } from '@/types/db'

const mockSendTaskCreateNotifications = jest.fn()

jest.mock('@trigger.dev/sdk/v3', () => ({
  task: (config: unknown) => config,
  logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
}))

jest.mock('@api/tasks/task-notifications.service', () => ({
  TaskNotificationsService: jest.fn().mockImplementation(() => ({
    sendTaskCreateNotifications: (...args: unknown[]) => mockSendTaskCreateNotifications(...args),
  })),
}))

import { TaskNotificationsService } from '@api/tasks/task-notifications.service'

import { sendTaskCreateNotifications } from './send-task-create-notifications'

const taskConfig = sendTaskCreateNotifications as unknown as {
  retry: {
    maxAttempts: number
    factor: number
    minTimeoutInMs: number
    maxTimeoutInMs: number
    randomize: boolean
  }
  run: (payload: { user: unknown; task: TaskWithWorkflowState }, ctx: unknown) => Promise<unknown>
}

describe('sendTaskCreateNotifications job', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSendTaskCreateNotifications.mockReset()
  })

  it('retries transient notification failures with bounded backoff', () => {
    expect(taskConfig.retry).toEqual({
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 15_000,
      randomize: true,
    })
  })

  it('delegates notification delivery to TaskNotificationsService', async () => {
    const user = { workspaceId: 'ws_1' }
    const task = { id: 'task_1' } as TaskWithWorkflowState

    await taskConfig.run({ user, task }, { ctx: { runId: 'run_1' } })

    expect(TaskNotificationsService).toHaveBeenCalledWith(user)
    expect(mockSendTaskCreateNotifications).toHaveBeenCalledWith(task)
  })
})
