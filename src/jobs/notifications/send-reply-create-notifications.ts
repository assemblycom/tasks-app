import { NotificationRequestBody, NotificationSender } from '@/types/common'
import { getAssigneeName } from '@/utils/assignee'
import { copilotBottleneck } from '@/utils/bottleneck'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { isMessagableError } from '@/utils/copilotError'
import { CommentRepository } from '@/app/api/comments/comment.repository'
import { CommentService } from '@/app/api/comments/comment.service'
import User from '@api/core/models/User.model'
import { TasksService } from '@api/tasks/tasks.service'
import { Comment, CommentInitiator, Task } from '@prisma/client'
import { logger, task } from '@trigger.dev/sdk/v3'
import { z } from 'zod'

type CommentCreateNotificationPayload = {
  user: User
  task: Task
  comment: Comment
}

/**
 * This job is used to send notifications to all active users commenting on a thread, when a new reply is created to a comment.
 */
export const sendReplyCreateNotifications = task({
  id: 'send-reply-create-notifications',
  machine: { preset: 'medium-1x' },
  queue: { concurrencyLimit: 25 },

  run: async (payload: CommentCreateNotificationPayload, { ctx }) => {
    logger.log('Sending reply creation notifications for:', { payload, ctx })

    const { comment, user } = payload
    if (!comment.parentId) {
      throw new Error('Unable to send reply notifications since parentId does not exist')
    }

    const commentsRepo = new CommentRepository(user)
    const copilot = new CopilotAPI(user.token)

    const senderId = z
      .string()
      .uuid()
      .parse(user.internalUserId || user.clientId)
    const senderType: NotificationSender = user.internalUserId ? CommentInitiator.internalUser : CommentInitiator.client
    // Copilot requires senderCompanyId when the sender is a client in a multi-company workspace
    const senderCompanyId = senderType === CommentInitiator.client ? user.companyId : undefined

    const deliveryTargets = await getNotificationDetails(copilot, user, comment)

    const notificationPromises: Promise<unknown>[] = []
    const queueNotificationPromise = <T>(promise: Promise<T>): void => {
      notificationPromises.push(copilotBottleneck.schedule(() => promise))
    }

    // Get all initiators involved in thread except the current user
    const threadInitiators = (await commentsRepo.getFirstCommentInitiators([comment.parentId], 10_000)).filter(
      (initiator) => initiator.initiatorId !== senderId,
    )

    // Queue notifications to every unique reply initiator
    for (let initiator of threadInitiators) {
      const promise = getInitiatorNotificationPromises(
        copilot,
        initiator,
        senderId,
        senderType,
        senderCompanyId,
        deliveryTargets,
        // NOTE: We are sending payload.task.companyId here. This might sound silly, i agree.
        // However, it is very safe to assume that client users can ONLY reply to comments in tasks
        // assigned to their company, or to them. In both cases, payload.task.companyId works
        // For IU tasks, this will be undefined
        payload.task.companyId || undefined,
      )
      promise && queueNotificationPromise(promise) // It's certain we will get a promise here
    }

    const commentService = new CommentService(user)
    const parentComment = await commentService.getCommentById({ id: comment.parentId })
    if (parentComment) {
      // Queue notification for parent comment initiator, if:
      // - Parent Comment hasn't been deleted yet
      // - Parent Comment initiatorId isn't this current user
      // - Parent comment hasn't been already sent a notification through a reply
      const isParentCommentDeleted = !!parentComment.deletedAt
      const parentInitiatorIsCurrentUser = parentComment.initiatorId === senderId
      const isNotificationAlreadySent = threadInitiators.some(
        (initiator) => initiator.initiatorId === parentComment.initiatorId,
      )
      if (!isParentCommentDeleted && !parentInitiatorIsCurrentUser && !isNotificationAlreadySent) {
        let promise = getInitiatorNotificationPromises(
          copilot,
          parentComment,
          senderId,
          senderType,
          senderCompanyId,
          deliveryTargets,
          payload.task.companyId || undefined,
        )
        // If there is no "initiatorType" for parentComment we have to be slightly creative (coughhackycough)
        if (!promise) {
          promise = getNotificationToUntypedInitiator(
            copilot,
            parentComment,
            payload.task,
            senderId,
            senderType,
            senderCompanyId,
            deliveryTargets,
          )
        }
        queueNotificationPromise(promise)
      }
    }

    await Promise.all(notificationPromises)
  },
})

const getNotificationDetails = async (copilot: CopilotAPI, user: User, comment: Comment) => {
  // Get parent task for title
  const tasksService = new TasksService(user)
  const task = await tasksService.getOneTask(comment.taskId)
  const senderType: NotificationSender = user.internalUserId ? CommentInitiator.internalUser : CommentInitiator.client
  const senderId = z
    .string()
    .uuid()
    .parse(user.internalUserId || user.clientId)
  const getSenderDetails = senderType === CommentInitiator.internalUser ? copilot.getInternalUser : copilot.getClient
  const sender = await getSenderDetails(senderId)
  const senderName = getAssigneeName(sender)

  const ctaParams = { taskId: task.id, commentId: comment.parentId, replyId: comment.id }
  const deliveryTargets = {
    inProduct: {
      title: 'Reply was added',
      body: `${senderName} replied to your comment on the task ‘${task.title}’.`,
      ctaParams,
    },
    email: {
      subject: 'A reply was added',
      header: `A reply was added by ${senderName}`,
      title: 'View reply',
      body: `${senderName} replied to a thread on the task '${task.title}'. To view the reply, open the task below.`,
      ctaParams,
    },
  }

  return deliveryTargets
}

const getInitiatorNotificationPromises = (
  copilot: CopilotAPI,
  // Initiator in this context means previous initiators that were active in the thread, NOT the currently commenting user
  initiator: { initiatorId: string; initiatorType: CommentInitiator | null },
  senderId: string,
  senderType: NotificationSender,
  senderCompanyId: string | undefined,
  deliveryTargets: { inProduct: Record<'title', any>; email: object },
  initiatorCompanyId?: string,
  // Forces recipient branch when initiator.initiatorType is unset (legacy comments)
  assume?: CommentInitiator,
) => {
  let body: NotificationRequestBody
  if (initiator.initiatorType === CommentInitiator.internalUser || assume === CommentInitiator.internalUser) {
    body = {
      senderId,
      senderType,
      senderCompanyId,
      recipientInternalUserId: initiator.initiatorId,
      deliveryTargets: { inProduct: deliveryTargets.inProduct },
    }
  } else if (initiator.initiatorType === CommentInitiator.client || assume === CommentInitiator.client) {
    body = {
      senderId,
      senderType,
      senderCompanyId,
      recipientClientId: initiator.initiatorId,
      recipientCompanyId: initiatorCompanyId,
      deliveryTargets: { email: deliveryTargets.email },
    }
  } else {
    return null
  }
  return createNotificationWithCompanyFallback(copilot, body)
}

// Single-company workspaces reject senderCompanyId; retry without it on that specific error.
// Mirrors NotificationService#handleIfSenderCompanyIdError.
const createNotificationWithCompanyFallback = async (copilot: CopilotAPI, body: NotificationRequestBody) => {
  try {
    return await copilot.createNotification(body)
  } catch (e) {
    if (isMessagableError(e) && e.body?.message === 'sender company ID is invalid based on sender') {
      return await copilot.createNotification({ ...body, senderCompanyId: undefined })
    }
    throw e
  }
}

const getNotificationToUntypedInitiator = async (
  copilot: CopilotAPI,
  parentComment: Comment,
  task: Task,
  senderId: string,
  senderType: NotificationSender,
  senderCompanyId: string | undefined,
  deliveryTargets: { inProduct: Record<'title', any>; email: object },
) => {
  try {
    await copilot.getInternalUser(parentComment.initiatorId)
    // `assume` guarantees a non-null promise
    return getInitiatorNotificationPromises(
      copilot,
      parentComment,
      senderId,
      senderType,
      senderCompanyId,
      deliveryTargets,
      task.companyId || undefined,
      CommentInitiator.internalUser,
    )!
  } catch (e) {
    console.error(e)
  }

  return getInitiatorNotificationPromises(
    copilot,
    parentComment,
    senderId,
    senderType,
    senderCompanyId,
    deliveryTargets,
    task.companyId || undefined,
    CommentInitiator.client,
  )!
}
