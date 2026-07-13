import { EmailNotificationDetails } from '@/types/common'
import { TaskWithWorkflowState } from '@/types/db'
import User from '@api/core/models/User.model'
import { TaskNotificationsService } from '@api/tasks/task-notifications.service'
import { logger, task } from '@trigger.dev/sdk/v3'

type CreateTaskNotificationPayload = {
  user: User
  task: TaskWithWorkflowState
  emailOverride?: EmailNotificationDetails
}

export const sendTaskCreateNotifications = task({
  id: 'send-task-create-notifications',
  machine: { preset: 'medium-1x' },
  queue: {
    concurrencyLimit: 5,
  },

  run: async (payload: CreateTaskNotificationPayload, { ctx }) => {
    logger.log('Sending task creation notifications for:', { payload, ctx })

    const { task, user, emailOverride } = payload
    const taskNotificationsSevice = new TaskNotificationsService(user)
    await taskNotificationsSevice.sendTaskCreateNotifications({ task, emailOverride })

    return {
      message: `Sent create notifications for taskId ${task.id} successfully`,
    }
  },
})
