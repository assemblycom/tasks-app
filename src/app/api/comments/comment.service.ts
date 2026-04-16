import { AttachmentsService } from '@/app/api/attachments/attachments.service'
import { PublicCommentSerializer } from '@/app/api/comments/public/public.serializer'
import { sendCommentCreateNotifications } from '@/jobs/notifications'
import { sendReplyCreateNotifications } from '@/jobs/notifications/send-reply-create-notifications'
import { InitiatedEntity, TempClientFilter } from '@/types/common'
import { CreateAttachmentRequestSchema } from '@/types/dto/attachments.dto'
import { CommentsPublicFilterType, CommentWithAttachments, CreateComment, UpdateComment } from '@/types/dto/comment.dto'
import { DISPATCHABLE_EVENT } from '@/types/webhook'
import { getArrayDifference, getArrayIntersection } from '@/utils/array'
import { getFileNameFromPath } from '@/utils/attachmentUtils'
import { getFilePathFromUrl } from '@/utils/signedUrlReplacer'
import { SupabaseActions } from '@/utils/SupabaseActions'
import { getBasicPaginationAttributes } from '@/utils/pagination'
import { CommentAddedSchema } from '@api/activity-logs/schemas/CommentAddedSchema'
import { ActivityLogger } from '@api/activity-logs/services/activity-logger.service'
import { CommentRepository } from '@/app/api/comments/comment.repository'
import APIError from '@api/core/exceptions/api'
import { BaseService } from '@api/core/services/base.service'
import { PoliciesService } from '@api/core/services/policies.service'
import { Resource } from '@api/core/types/api'
import { UserAction } from '@api/core/types/user'
import { TasksService } from '@api/tasks/tasks.service'
import { ActivityType, Comment, CommentInitiator, Prisma, PrismaClient } from '@prisma/client'
import httpStatus from 'http-status'
import { z } from 'zod'
import { getSignedUrl } from '@/utils/signUrl'
import { PublicTasksService } from '@/app/api/tasks/public/public.service'

export class CommentService extends BaseService {
  async create(data: CreateComment) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Create, Resource.Comment)

    const initiatorId = z.string().parse(this.user.internalUserId || this.user.clientId)
    const initiatorType = this.user.internalUserId ? CommentInitiator.internalUser : CommentInitiator.client

    const task = await this.db.task.findFirst({
      where: {
        id: data.taskId,
        workspaceId: this.user.workspaceId,
      },
    })
    if (!task) throw new APIError(httpStatus.NOT_FOUND, `Could not find task with id ${data.taskId}`)

    const comment = await this.db.comment.create({
      data: {
        content: data.content,
        taskId: data.taskId,
        parentId: data.parentId,
        workspaceId: this.user.workspaceId,
        initiatorId,
        // This is safe to do, since if user doesn't have both iu ID / client ID, they will be filtered out way before
        initiatorType,
      },
      include: { attachments: true },
    })

    let commentToReturn = comment // return the latest comment object with attachments (if any)
    try {
      if (comment.content) {
        const newContent = await this.updateCommentIdOfAttachmentsAfterCreation(comment.content, data.taskId, comment.id)
        // mutate commentToReturn here with signed attachment urls
        commentToReturn = await this.db.comment.update({
          where: { id: comment.id },
          data: {
            content: newContent,
            updatedAt: comment.createdAt, //dont updated the updatedAt, because it will show (edited) for recently created comments.
          },
          include: { attachments: true },
        })
        console.info('CommentService#createComment | Comment content attachments updated for comment ID:', comment.id)
      }
    } catch (e: unknown) {
      await this.db.comment.delete({ where: { id: comment.id } })
      console.error('CommentService#createComment | Rolling back comment creation', e)
    }

    if (!comment.parentId) {
      const activityLogger = new ActivityLogger({ taskId: data.taskId, user: this.user })
      await activityLogger.log(
        ActivityType.COMMENT_ADDED,
        CommentAddedSchema.parse({
          id: comment.id,
          content: comment.content,
          initiatorId,
          initiatorType,
          parentId: comment.parentId,
        }),
      )
      await sendCommentCreateNotifications.trigger({ user: this.user, task, comment })
    } else {
      const tasksService = new TasksService(this.user)
      await Promise.all([
        // Update last activity log timestamp for task even on replies so they are reflected in realtime
        tasksService.setNewLastActivityLogUpdated(data.taskId),
        sendReplyCreateNotifications.trigger({ user: this.user, task, comment }),
      ])
    }

    // dispatch a webhook event when comment is created
    await this.copilot.dispatchWebhook(DISPATCHABLE_EVENT.CommentCreated, {
      payload: await PublicCommentSerializer.serialize(commentToReturn),
      workspaceId: this.user.workspaceId,
    })

    return commentToReturn

    // if (data.mentions) {
    //   await notificationService.createBulkNotification(NotificationTaskActions.Mentioned, task, data.mentions, {
    //     commentId: comment.id,
    //   })
    // }
  }

  async delete(id: string) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Delete, Resource.Comment)

    const commentExists = await this.db.comment.findFirst({ where: { id } })
    if (!commentExists) throw new APIError(httpStatus.NOT_FOUND, 'The comment to delete was not found')

    // delete the comment
    const comment = await this.db.comment.delete({ where: { id } })

    // delete the related attachments as well
    const attachmentService = new AttachmentsService(this.user)
    await attachmentService.deleteAttachmentsOfComment(comment.id)

    // transaction that deletes the activity logs
    return await this.db.$transaction(async (tx) => {
      this.setTransaction(tx as PrismaClient)
      const replyCounts = await this.getReplyCounts([id])

      // Delete corresponding activity log as well, so as to remove comment from UI
      // If activity log exists but comment has a `deletedAt`, show "Comment was deleted" card instead
      if (!replyCounts[id]) {
        // If there are 0 replies, key won't be in object
        await this.deleteRelatedActivityLogs(id)
      }

      // If parent comment now has no replies and is also deleted, delete parent as well
      if (comment.parentId) {
        const parent = await this.db.comment.findFirst({ where: { id: comment.parentId, deletedAt: undefined } })
        if (parent?.deletedAt) {
          await this.deleteEmptyParentActivityLog(parent)
        }
      }

      const tasksService = new TasksService(this.user)
      tasksService.setTransaction(tx as PrismaClient)

      await tasksService.setNewLastActivityLogUpdated(comment.taskId)
      tasksService.unsetTransaction()

      this.unsetTransaction()
      return { ...comment, attachments: [] } // send empty attachments array
    })
  }

  private async deleteEmptyParentActivityLog(parent: Comment) {
    const parentReplyCounts = await this.getReplyCounts([parent.id])
    if (!parentReplyCounts[parent.id]) {
      await this.deleteRelatedActivityLogs(parent.id)
    }
  }

  private async deleteRelatedActivityLogs(id: string) {
    // Can't use `delete` only here, but only one activity log will have details.id with commentId
    await this.db.activityLog.deleteMany({
      where: {
        details: { path: ['id'], equals: id },
      },
    })
  }

  async update(id: string, data: UpdateComment) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Update, Resource.Comment)

    const filters = { id, workspaceId: this.user.workspaceId, initiatorId: this.user.internalUserId, deletedAt: undefined }
    const prevComment = await this.db.comment.findFirst({
      where: filters,
    })
    if (!prevComment) throw new APIError(httpStatus.NOT_FOUND, 'The comment to update was not found')

    const comment = await this.db.comment.update({
      where: filters,
      data,
    })
    const tasksService = new TasksService(this.user)
    await tasksService.setNewLastActivityLogUpdated(comment.taskId)
    return comment
  }

  async getCommentById({ id, includeAttachments }: { id: string; includeAttachments?: boolean }) {
    const comment = await this.db.comment.findFirst({
      where: { id, deletedAt: undefined }, // Can also get soft deleted comments
      include: { attachments: includeAttachments },
    })
    if (!comment) throw new APIError(httpStatus.NOT_FOUND, 'The requested comment was not found')

    let initiator
    if (comment?.initiatorType === CommentInitiator.internalUser) {
      initiator = await this.copilot.getInternalUser(comment.initiatorId)
    } else if (comment?.initiatorType === CommentInitiator.client) {
      initiator = await this.copilot.getClient(comment.initiatorId)
    } else {
      try {
        initiator = await this.copilot.getInternalUser(comment.initiatorId)
      } catch (e) {
        initiator = await this.copilot.getClient(comment.initiatorId)
      }
    }

    return { ...comment, initiator }
  }

  async getCommentsByIds(commentIds: string[]) {
    return await this.db.comment.findMany({
      where: {
        id: { in: commentIds },
        deletedAt: undefined, // Also get deleted comments (to show if comment parent was deleted)
      },
    })
  }

  async getComments({ parentId }: { parentId: string }) {
    return await this.db.comment.findMany({
      where: {
        parentId,
        workspaceId: this.user.workspaceId,
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  /**
   * Returns an object with parentId as key and array of reply comments containing that comment as parentId
   * as value
   */
  async getReplyCounts(commentIds: string[]): Promise<Record<string, number>> {
    if (!commentIds) return {}

    const result = await this.db.comment.groupBy({
      by: ['parentId'],
      where: {
        parentId: { in: commentIds },
        workspaceId: this.user.workspaceId,
        deletedAt: null,
      },
      _count: { id: true },
    })
    const counts: Record<string, number> = {}
    result.forEach((row) => row.parentId && (counts[row.parentId] = row._count.id))
    return counts
  }

  /**
   * Gets the first 0 - n number of unique initiators for a comment thread based on the parentIds
   */
  async getThreadInitiators(
    commentIds: string[],
    opts: {
      limit?: number
    } = { limit: 3 },
  ) {
    if (!commentIds.length) return {}
    const commentRepo = new CommentRepository(this.user)
    const results = await commentRepo.getFirstCommentInitiators(commentIds, opts.limit)

    const initiators: Record<string, unknown[]> = {}
    // Extract initiator ids
    for (let { parentId, initiatorId, initiatorType } of results) {
      if (!parentId) continue
      initiators[parentId] ??= []
      initiators[parentId].push(initiatorId)
    }

    return initiators
  }

  async getReplies(commentIds: string[], expandComments: string[] = []) {
    if (!commentIds.length) return []

    let replies: Comment[] = []

    // Exclude any expandComments that aren't in commentIds so user can't inject
    // random ids to access comments outside of their scope
    const validExpandComments = expandComments.length ? getArrayIntersection(commentIds, expandComments) : []
    // Exclude any ids already in expandComments, since this will be used to limit to 3 replies per parent
    commentIds = validExpandComments.length ? getArrayDifference(commentIds, validExpandComments) : commentIds

    const commentRepo = new CommentRepository(this.user)
    if (validExpandComments.length) {
      const expandedReplies = await commentRepo.getAllRepliesForParents(expandComments)
      replies = [...replies, ...expandedReplies]
    }
    const limitedReplies = await commentRepo.getLimitedRepliesForParents(commentIds)
    replies = [...replies, ...limitedReplies]

    return replies
  }

  async addInitiatorDetails(comments: InitiatedEntity[]) {
    if (!comments.length) {
      return comments
    }

    const [internalUsers, clients] = await Promise.all([this.copilot.getInternalUsers(), this.copilot.getClients()])

    return comments.map((comment) => {
      let initiator
      const getUser = (user: { id: string }) => user.id === comment.initiatorId

      if (comment.initiatorType === CommentInitiator.internalUser) {
        initiator = internalUsers.data.find(getUser)
      } else if (comment.initiatorType === CommentInitiator.client) {
        initiator = clients?.data?.find(getUser)
      } else {
        initiator = internalUsers.data.find(getUser) || clients?.data?.find(getUser)
      }
      return { ...comment, initiator }
    })
  }

  private async updateCommentIdOfAttachmentsAfterCreation(htmlString: string, task_id: string, commentId: string) {
    const imgTagRegex = /<img\s+[^>]*src="([^"]+)"[^>]*>/g //expression used to match all img srcs in provided HTML string.
    const attachmentTagRegex = /<\s*[a-zA-Z]+\s+[^>]*data-type="attachment"[^>]*src="([^"]+)"[^>]*>/g //expression used to match all attachment srcs in provided HTML string.
    let match
    const replacements: { originalSrc: string; newUrl: string }[] = []

    const newFilePaths: { originalSrc: string; newFilePath: string }[] = []
    const copyAttachmentPromises: Promise<void>[] = []
    const createAttachmentPayloads = []
    const matches: { originalSrc: string; filePath: string; fileName: string }[] = []

    while ((match = imgTagRegex.exec(htmlString)) !== null) {
      const originalSrc = match[1]
      const filePath = getFilePathFromUrl(originalSrc)
      const fileName = filePath?.split('/').pop()
      if (filePath && fileName) {
        matches.push({ originalSrc, filePath, fileName })
      }
    }

    while ((match = attachmentTagRegex.exec(htmlString)) !== null) {
      const originalSrc = match[1]
      const filePath = getFilePathFromUrl(originalSrc)
      const fileName = filePath?.split('/').pop()
      if (filePath && fileName) {
        matches.push({ originalSrc, filePath, fileName })
      }
    }

    for (const { originalSrc, filePath, fileName } of matches) {
      const newFilePath = `${this.user.workspaceId}/${task_id}/comments/${commentId}/${fileName}`
      const supabaseActions = new SupabaseActions()

      const fileMetaData = await supabaseActions.getMetaData(filePath)
      createAttachmentPayloads.push(
        CreateAttachmentRequestSchema.parse({
          commentId: commentId,
          filePath: newFilePath,
          fileSize: fileMetaData?.size,
          fileType: fileMetaData?.contentType,
          fileName: fileMetaData?.metadata?.originalFileName || getFileNameFromPath(newFilePath),
        }),
      )
      copyAttachmentPromises.push(supabaseActions.moveAttachment(filePath, newFilePath))
      newFilePaths.push({ originalSrc, newFilePath })
    }

    await Promise.all(copyAttachmentPromises)
    const attachmentService = new AttachmentsService(this.user)
    if (createAttachmentPayloads.length) {
      await attachmentService.createMultipleAttachments(createAttachmentPayloads)
    }

    const signedUrlPromises = newFilePaths.map(async ({ originalSrc, newFilePath }) => {
      const newUrl = await getSignedUrl(newFilePath)
      if (newUrl) {
        replacements.push({ originalSrc, newUrl })
      }
    })

    await Promise.all(signedUrlPromises)

    for (const { originalSrc, newUrl } of replacements) {
      htmlString = htmlString.replace(originalSrc, newUrl)
    }
    // const filePaths = newFilePaths.map(({ newFilePath }) => newFilePath)
    // await this.db.scrapMedia.updateMany({
    //   where: {
    //     filePath: {
    //       in: filePaths,
    //     },
    //   },
    //   data: {
    //     taskId: task_id,
    //   },
    // }) //todo: add support for commentId in scrapMedias.
    return htmlString
  } //todo: make this resuable since this is highly similar to what we are doing on tasks.

  async getAllComments(queryFilters: CommentsPublicFilterType): Promise<CommentWithAttachments[]> {
    const { parentId, taskId, limit, lastIdCursor, initiatorId } = queryFilters
    const where: Prisma.CommentWhereInput = {
      parentId,
      taskId,
      initiatorId,
      workspaceId: this.user.workspaceId,
    }

    const pagination = getBasicPaginationAttributes(limit, lastIdCursor)
    if (this.user.clientId || this.user.companyId) {
      where.task = this.getClientOrCompanyAssigneeFilter()
    }

    return await this.db.comment.findMany({
      where,
      ...pagination,
      include: { attachments: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  async hasMoreCommentsAfterCursor(id: string, publicFilters: Partial<CommentsPublicFilterType>): Promise<boolean> {
    const where: Prisma.CommentWhereInput = {
      ...publicFilters,
      workspaceId: this.user.workspaceId,
    }
    if (this.user.clientId || this.user.companyId) {
      where.task = this.getClientOrCompanyAssigneeFilter()
    }
    const newComment = await this.db.comment.findFirst({
      where,
      cursor: { id },
      skip: 1,
      orderBy: { createdAt: 'desc' },
    })
    return !!newComment
  }

  /**
   * If the user has permission to access the task, it means the user has access to the task's comments
   * Therefore checking the task permission
   */
  async checkCommentTaskPermissionForUser(taskId: string) {
    try {
      const publicTask = new PublicTasksService(this.user)
      await publicTask.getOneTask(taskId)
    } catch (err: unknown) {
      if (err instanceof APIError) {
        let status: number = httpStatus.UNAUTHORIZED,
          message = 'You are not authorized to perform this action'
        if (err.status === httpStatus.NOT_FOUND) {
          status = httpStatus.NOT_FOUND
          message = 'A task for the requested comment was not found'
        }
        throw new APIError(status, message)
      }
      throw err
    }
  }

  protected getClientOrCompanyAssigneeFilter(includeAssociatedTask: boolean = true): Prisma.TaskWhereInput {
    const clientId = z.string().uuid().parse(this.user.clientId)
    const companyId = z.string().uuid().parse(this.user.companyId)
    const isCuPortal = !this.user.internalUserId && (clientId || companyId)

    const filters = []

    if (clientId && companyId) {
      filters.push(
        // Get client tasks for the particular companyId
        { clientId, companyId },
        // Get company tasks for the client's companyId
        { companyId, clientId: null },
      )
      if (includeAssociatedTask) {
        const tempClientFilter: TempClientFilter = {
          associations: {
            hasSome: [{ clientId, companyId }, { companyId }],
          },
        }
        if (isCuPortal) tempClientFilter.isShared = true
        // Get tasks that includes the client as a association
        filters.push(tempClientFilter)
      }
    } else if (companyId) {
      filters.push(
        // Get only company tasks for the client's companyId
        { clientId: null, companyId },
      )

      // Get tasks that includes the company as a association
      if (includeAssociatedTask) {
        const tempCompanyFilter: TempClientFilter = {
          associations: {
            hasSome: [{ companyId }],
          },
        }
        if (isCuPortal) tempCompanyFilter.isShared = true
        filters.push(tempCompanyFilter)
      }
    }
    return filters.length > 0 ? { OR: filters } : {}
  } //Repeated twice because taskSharedService is an abstract class.
}
