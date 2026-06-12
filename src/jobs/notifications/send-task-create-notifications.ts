import { TaskWithWorkflowState } from '@/types/db'
import User from '@api/core/models/User.model'
import { TaskNotificationsService } from '@api/tasks/task-notifications.service'
import { logger, task } from '@trigger.dev/sdk/v3'

type CreateTaskNotificationPayload = {
  user: User
  task: TaskWithWorkflowState
}

export const sendTaskCreateNotifications = task({
  id: 'send-task-create-notifications',
  machine: { preset: 'medium-1x' },
  queue: {
    concurrencyLimit: 5,
  },
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1_000, maxTimeoutInMs: 15_000, randomize: true },

  run: async (payload: CreateTaskNotificationPayload, { ctx }) => {
    logger.log('Sending task creation notifications for:', { payload, ctx })

    const { task, user } = payload
    const taskNotificationsSevice = new TaskNotificationsService(user)
    await taskNotificationsSevice.sendTaskCreateNotifications(task)

    return {
      message: `Sent create notifications for taskId ${task.id} successfully`,
    }
  },
})
