import { AttachmentsService } from '@/app/api/attachments/attachments.service'
import { BaseService } from '@api/core/services/base.service'
import { ScrapMediaService } from '@/app/api/scrap-medias/scrap-medias.service'
import { AttachmentTypes } from '@/types/interfaces'
import { buildFilePath } from '@/utils/attachmentUtils'
import { generateRandomString } from '@/utils/generateRandomString'
import { SupabaseActions } from '@/utils/SupabaseActions'
import APIError from '@api/core/exceptions/api'
import httpStatus from 'http-status'
import { Attachment } from '@prisma/client'

/**
 * Server-side orchestrator that condenses the in-app 3-hop upload flow
 * (request signed URL → PUT to Supabase → POST attachment row) into a
 * single multipart POST suitable for public API callers.
 *
 * The file is uploaded under the workspace-root path (matching the in-app
 * pre-task-save path), and a corresponding Attachment row is created in
 * an "orphan" state (taskId = null, commentId = null). Callers reference
 * the returned id from a task body via <public-attachment id="..." />;
 * the in-app post-create body sweep then binds the row to the task and
 * relocates the underlying file to the task-scoped path.
 */
export class PublicAttachmentsService extends BaseService {
  async uploadOrphanAttachment(uploadedFile: File): Promise<Attachment> {
    const orphanWorkspaceFilePath = buildFilePath({
      workspaceId: this.user.workspaceId,
      type: AttachmentTypes.TASK,
      entityId: null,
    })
    const uniqueFileName = generateRandomString(uploadedFile.name)

    const attachmentsService = new AttachmentsService(this.user)
    const supabaseActions = new SupabaseActions()

    const signedUploadInfo = await attachmentsService.signUrlUpload(uniqueFileName, orphanWorkspaceFilePath)

    const { filePayload, error: supabaseUploadError } = await supabaseActions.uploadAttachment(
      uploadedFile,
      signedUploadInfo,
      null,
    )
    if (supabaseUploadError || !filePayload) {
      throw new APIError(httpStatus.BAD_REQUEST, 'Failed to upload attachment to storage')
    }

    // No taskId/commentId — created in an "orphan" state. The post-create sweep
    // binds it to a task once the returned id is referenced in a task body.
    const newOrphanAttachment = await attachmentsService.createAttachments({
      filePath: filePayload.filePath,
      fileSize: filePayload.fileSize,
      fileType: filePayload.fileType,
      fileName: filePayload.fileName,
    })

    // Register the orphan with the ScrapMedia worker so the file + Attachment row
    // get cleaned up if the caller never references this id from a task body.
    // The post-create sweep deletes this ScrapMedia row once the orphan binds to a task.
    //
    // If tracking registration fails we roll back the Supabase file and the Attachment
    // row so the caller can retry cleanly — otherwise the file would be untracked and
    // leak permanently.
    try {
      await new ScrapMediaService(this.user).createScrapImage({ filePath: filePayload.filePath })
    } catch (scrapMediaTrackingError) {
      console.error('PublicAttachmentsService#uploadOrphanAttachment | Failed to register ScrapMedia, rolling back', {
        attachmentId: newOrphanAttachment.id,
        filePath: filePayload.filePath,
        error: scrapMediaTrackingError,
      })
      await supabaseActions.removeAttachment(filePayload.filePath).catch((cleanupError) => {
        console.error(
          'PublicAttachmentsService#uploadOrphanAttachment | Failed to remove Supabase file during rollback',
          cleanupError,
        )
      })
      await this.db.attachment.delete({ where: { id: newOrphanAttachment.id } }).catch((cleanupError) => {
        console.error(
          'PublicAttachmentsService#uploadOrphanAttachment | Failed to delete Attachment row during rollback',
          cleanupError,
        )
      })
      throw new APIError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to register attachment for cleanup tracking')
    }

    return newOrphanAttachment
  }
}
