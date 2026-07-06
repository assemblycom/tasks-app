import User from '@/app/api/core/models/User.model'
import { NotificationTaskActions } from '@/app/api/core/types/tasks'
import { UserRole } from '@/app/api/core/types/user'
import { isIuEmailEnabled } from '@/app/api/notification/isIuEmailEnabled'
import { NotificationService } from '@/app/api/notification/notification.service'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { Comment, Task } from '@prisma/client'
import { logger, task } from '@trigger.dev/sdk/v3'

type CommentCreateNotificationPayload = {
  user: User
  task: Task
  comment: Comment
}

export const sendCommentCreateNotifications = task({
  id: 'send-comment-create-notifications',
  machine: { preset: 'medium-1x' },
  queue: {
    concurrencyLimit: 5,
  },

  run: async (payload: CommentCreateNotificationPayload, { ctx }) => {
    logger.log('Sending comment creation notifications for:', { payload, ctx })

    const { comment, task, user } = payload

    // If task is unassigned, there's nobody to send notifications to
    if (!task.assigneeId || !task.assigneeType) return

    const commentNotificationService = new NotificationService(user)
    const copilot = new CopilotAPI(user.token)
    const { recipientIds: clientRecipientIds } = await commentNotificationService.getNotificationParties(
      task,
      NotificationTaskActions.CommentToCU,
    )

    const filteredCUIds = clientRecipientIds.filter((id: string) => id !== comment.initiatorId)
    console.info('creating notifications for CUS', filteredCUIds)
    await commentNotificationService.createBulkNotification(NotificationTaskActions.Commented, task, filteredCUIds, {
      email: true,
      disableInProduct: true,
      commentId: comment.id,
    })

    const { recipientIds: iuRecipientIds, senderCompanyId } = await commentNotificationService.getNotificationParties(
      task,
      NotificationTaskActions.CommentToIU,
    )

    const filteredIUIds = iuRecipientIds.filter((id: string) => id !== comment.initiatorId)
    console.info('creating notifications for IUs', filteredIUIds)
    await commentNotificationService.createBulkNotification(NotificationTaskActions.Commented, task, filteredIUIds, {
      email: isIuEmailEnabled(),
      disableInProduct: false,
      commentId: comment.id,
      senderCompanyId,
      isRecipientIu: true,
    })
  },
})
