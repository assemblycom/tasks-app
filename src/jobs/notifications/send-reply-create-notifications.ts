import { NotificationRequestBody, NotificationSender } from '@/types/common'
import { getAssigneeName } from '@/utils/assignee'
import { copilotBottleneck } from '@/utils/bottleneck'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { isMessagableError } from '@/utils/copilotError'
import { CommentRepository } from '@/app/api/comments/comment.repository'
import { CommentService } from '@/app/api/comments/comment.service'
import { NotificationService } from '@/app/api/notification/notification.service'
import { resolveIuNotificationSettingId } from '@/app/api/notification/resolveNotificationSettingId'
import User from '@api/core/models/User.model'
import { TasksService } from '@api/tasks/tasks.service'
import { Comment, CommentInitiator, GroupedEmailEventType, Task } from '@prisma/client'
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
    const notificationService = new NotificationService(user)

    const senderId = z
      .string()
      .uuid()
      .parse(user.internalUserId || user.clientId)
    const senderType: NotificationSender = user.internalUserId ? CommentInitiator.internalUser : CommentInitiator.client
    // Copilot requires senderCompanyId when the sender is a client in a multi-company workspace
    const senderCompanyId = senderType === CommentInitiator.client ? user.companyId : undefined

    const deliveryTargets = await getNotificationDetails(copilot, user, comment)

    // Replies are the COMMENT category. Reply emails are buffered as COMMENT grouped events (like
    // top-level comments), and IU sends carry this setting id so the platform gates each surface per
    // the recipient IU's preference.
    const notificationSettingId = await resolveIuNotificationSettingId({
      copilot,
      workspaceId: user.workspaceId,
      category: GroupedEmailEventType.COMMENT,
    })

    const notificationPromises: Promise<unknown>[] = []
    const queueNotificationPromise = (promise: Promise<unknown>): void => {
      notificationPromises.push(copilotBottleneck.schedule(() => promise))
    }

    const shared = {
      copilot,
      notificationService,
      task: payload.task,
      senderId,
      senderType,
      senderCompanyId,
      deliveryTargets,
      commentId: comment.id,
      // NOTE: We are sending payload.task.companyId here. This might sound silly, i agree.
      // However, it is very safe to assume that client users can ONLY reply to comments in tasks
      // assigned to their company, or to them. In both cases, payload.task.companyId works
      // For IU tasks, this will be undefined
      initiatorCompanyId: payload.task.companyId || undefined,
      notificationSettingId,
    }

    // Get all initiators involved in thread except the current user
    const threadInitiators = (await commentsRepo.getFirstCommentInitiators([comment.parentId], 10_000)).filter(
      (initiator) => initiator.initiatorId !== senderId,
    )

    // Queue notifications to every unique reply initiator
    for (let initiator of threadInitiators) {
      const promise = getInitiatorNotificationPromises({ ...shared, initiator })
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
        const typedPromise = getInitiatorNotificationPromises({ ...shared, initiator: parentComment })
        // If there is no "initiatorType" for parentComment we have to be slightly creative (coughhackycough)
        const promise = typedPromise ?? getNotificationToUntypedInitiator({ ...shared, parentComment })
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

type ReplyDispatchArgs = {
  copilot: CopilotAPI
  notificationService: NotificationService
  task: Task
  // Initiator in this context means previous initiators that were active in the thread, NOT the currently commenting user
  initiator: { initiatorId: string; initiatorType: CommentInitiator | null }
  senderId: string
  senderType: NotificationSender
  senderCompanyId: string | undefined
  deliveryTargets: { inProduct: Record<'title', any>; email: object }
  initiatorCompanyId?: string
  commentId: string
  // Forces recipient branch when initiator.initiatorType is unset (legacy comments)
  assume?: CommentInitiator
  notificationSettingId?: string
}

const getInitiatorNotificationPromises = ({
  copilot,
  notificationService,
  task: parentTask,
  initiator,
  senderId,
  senderType,
  senderCompanyId,
  deliveryTargets,
  initiatorCompanyId,
  commentId,
  assume,
  notificationSettingId,
}: ReplyDispatchArgs) => {
  const base = { senderId, senderType, senderCompanyId }
  const isIu = initiator.initiatorType === CommentInitiator.internalUser || assume === CommentInitiator.internalUser
  const isClient = initiator.initiatorType === CommentInitiator.client || assume === CommentInitiator.client
  if (!isIu && !isClient) return null

  if (isIu) {
    // IU: fire the in-product notification now (the platform gates it per the IU's preference via the
    // setting id) and buffer the email as a COMMENT event so it groups + gates like top-level comments.
    const iuBase = {
      ...base,
      recipientInternalUserId: initiator.initiatorId,
      ...(notificationSettingId ? { notificationSettingId } : {}),
    }
    const inProductBody: NotificationRequestBody = { ...iuBase, deliveryTargets: { inProduct: deliveryTargets.inProduct } }
    const emailBody: NotificationRequestBody = { ...iuBase, deliveryTargets: { email: deliveryTargets.email } }
    return Promise.all([
      createNotificationWithCompanyFallback(copilot, inProductBody),
      notificationService.bufferGroupedEmailEvent({
        task: parentTask,
        recipientId: initiator.initiatorId,
        isRecipientIu: true,
        eventType: GroupedEmailEventType.COMMENT,
        commentId,
        individualEmail: emailBody,
      }),
    ])
  }

  // Client: buffer the reply email only (clients get no in-product reply notification today).
  const clientEmailBody: NotificationRequestBody = {
    ...base,
    recipientClientId: initiator.initiatorId,
    recipientCompanyId: initiatorCompanyId,
    deliveryTargets: { email: deliveryTargets.email },
  }
  return notificationService.bufferGroupedEmailEvent({
    task: parentTask,
    recipientId: initiator.initiatorId,
    companyId: initiatorCompanyId,
    isRecipientIu: false,
    eventType: GroupedEmailEventType.COMMENT,
    commentId,
    individualEmail: clientEmailBody,
  })
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

const getNotificationToUntypedInitiator = async ({
  parentComment,
  ...shared
}: Omit<ReplyDispatchArgs, 'initiator' | 'assume'> & { parentComment: Comment }) => {
  const withInitiator = { ...shared, initiator: parentComment }
  try {
    await shared.copilot.getInternalUser(parentComment.initiatorId)
    // `assume` guarantees a non-null promise
    return getInitiatorNotificationPromises({ ...withInitiator, assume: CommentInitiator.internalUser })!
  } catch (e) {
    console.error(e)
  }

  return getInitiatorNotificationPromises({ ...withInitiator, assume: CommentInitiator.client })!.catch((e) => {
    console.error(e)
    return undefined
  })
}
