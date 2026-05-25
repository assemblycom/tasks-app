import { BaseService } from '@api/core/services/base.service'
import { PoliciesService } from '@api/core/services/policies.service'
import { UserAction } from '@api/core/types/user'
import { Resource } from '@api/core/types/api'
import { CreateAttachmentRequest } from '@/types/dto/attachments.dto'
import { z } from 'zod'
import { supabaseBucket } from '@/config'
import APIError from '@api/core/exceptions/api'
import httpStatus from 'http-status'
import { SupabaseService } from '@api/core/services/supabase.service'
import { signedUrlTtl } from '@/constants/attachments'
import { PrismaClient } from '@prisma/client'

export class AttachmentsService extends BaseService {
  async getAttachments(taskId: string) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Read, Resource.Attachments)
    const attachments = await this.db.attachment.findMany({
      where: {
        taskId: taskId,
        workspaceId: this.user.workspaceId,
      },
    })

    return attachments
  }

  async createAttachments(data: CreateAttachmentRequest) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Create, Resource.Attachments)
    const newAttachment = await this.db.attachment.create({
      data: {
        ...data,
        createdById: z.string().parse(this.user.internalUserId || this.user.clientId), // CU are also allowed to create attachments
        workspaceId: this.user.workspaceId,
      },
    })
    return newAttachment
  }

  /**
   * Insert an Attachment row not yet bound to any task or comment.
   * Used by the public API upload flow: caller uploads first, then references
   * the returned id from a task body via <public-attachment id="..." />.
   * The reference is later resolved server-side and the row's taskId is set.
   */
  async createOrphanAttachment(orphanAttachmentData: {
    filePath: string
    fileSize: number
    fileType: string
    fileName: string
  }) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Create, Resource.Attachments)
    const newOrphanAttachment = await this.db.attachment.create({
      data: {
        ...orphanAttachmentData,
        taskId: null,
        commentId: null,
        createdById: z.string().parse(this.user.internalUserId || this.user.clientId),
        workspaceId: this.user.workspaceId,
      },
    })
    return newOrphanAttachment
  }

  /**
   * Find orphan (taskId=null, commentId=null) attachments in this workspace by id.
   * Returns only rows that exist AND are orphan AND belong to the caller's workspace —
   * any id that fails those checks is silently filtered out by the caller's set diff.
   */
  async findOrphanAttachmentsByIds(attachmentIds: string[]) {
    if (!attachmentIds.length) return []
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Read, Resource.Attachments)
    return await this.db.attachment.findMany({
      where: {
        id: { in: attachmentIds },
        workspaceId: this.user.workspaceId,
        taskId: null,
        commentId: null,
        deletedAt: null,
      },
    })
  }

  async createMultipleAttachments(data: CreateAttachmentRequest[]) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Create, Resource.Attachments)

    // TODO: @arpandhakal - $transaction here could consume a lot of sequential db connections, better to use Promise.all
    // and reuse active connections instead.
    const newAttachments = await this.db.$transaction(async (prisma) => {
      const createPromises = data.map((attachmentData) =>
        prisma.attachment.create({
          data: {
            ...attachmentData,
            createdById: z.string().parse(this.user.internalUserId || this.user.clientId), // CU are also allowed to create attachments
            workspaceId: this.user.workspaceId,
          },
        }),
      )
      return await Promise.all(createPromises)
    })
    return newAttachments
  }

  async deleteAttachment(id: string) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Delete, Resource.Attachments)
    const deletedAttachment = await this.db.attachment.delete({ where: { id: id, workspaceId: this.user.workspaceId } })
    return deletedAttachment
  }

  async signUrlUpload(fileName: string, filePath: string) {
    const policyGate = new PoliciesService(this.user)
    const supabase = new SupabaseService()
    policyGate.authorize(UserAction.Create, Resource.Attachments)

    const { data, error } = await supabase.supabase.storage
      .from(supabaseBucket)
      .createSignedUploadUrl(filePath + '/' + fileName)
    if (error) {
      throw new APIError(httpStatus.BAD_REQUEST)
    }
    return data
  }

  async getSignedUrl(filePath: string) {
    const policyGate = new PoliciesService(this.user)
    const supabase = new SupabaseService()
    policyGate.authorize(UserAction.Create, Resource.Attachments)
    const { data } = await supabase.supabase.storage.from(supabaseBucket).createSignedUrl(filePath, signedUrlTtl)
    return data?.signedUrl
  }

  async deleteAttachmentsOfComment(commentId: string) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Delete, Resource.Attachments)

    const commentAttachment = await this.db.$transaction(async (tx) => {
      const commentAttachment = await tx.attachment.findMany({
        where: { commentId: commentId, workspaceId: this.user.workspaceId },
        select: { filePath: true },
      })

      await tx.attachment.deleteMany({
        where: { commentId: commentId, workspaceId: this.user.workspaceId },
      })

      return commentAttachment
    })

    // directly delete attachments from bucket when deleting comments.
    // Postgres transaction is not valid for supabase object so placing it after record deletion from db
    const filePathArray = commentAttachment.map((el) => el.filePath)
    const supabase = new SupabaseService()
    await supabase.removeAttachmentsFromBucket(filePathArray)
  }

  async deleteAttachmentsOfTask(taskIds: string[]) {
    const taskAttachment = await this.db.$transaction(async (tx) => {
      const taskAttachment = await tx.attachment.findMany({
        where: {
          taskId: {
            in: taskIds,
          },
          workspaceId: this.user.workspaceId,
        },
        select: { filePath: true },
      })

      await tx.attachment.deleteMany({
        where: {
          taskId: {
            in: taskIds,
          },
          workspaceId: this.user.workspaceId,
        },
      })

      return taskAttachment
    })

    // directly delete attachments from bucket when deleting comments.
    // Postgres transaction is not valid for supabase object so placing it after record deletion from db
    const filePathArray = taskAttachment.map((el) => el.filePath)
    const supabase = new SupabaseService()
    await supabase.removeAttachmentsFromBucket(filePathArray)
  }
}
