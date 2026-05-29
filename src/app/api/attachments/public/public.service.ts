import { AttachmentsService } from '@/app/api/attachments/attachments.service'
import { BaseService } from '@api/core/services/base.service'
import { ScrapMediaService } from '@/app/api/scrap-medias/scrap-medias.service'
import { generateRandomString } from '@/utils/generateRandomString'
import { SupabaseActions } from '@/utils/SupabaseActions'
import APIError from '@api/core/exceptions/api'
import httpStatus from 'http-status'

/**
 * Stages a File at the workspace-root path (same as the in-app pre-task-save flow) and
 * registers a ScrapMedia row so the file gets reaped by cron if it never makes it into a
 * task body. No Attachment row is created here — when the staged URL lands in a task body,
 * the post-create sweep (`updateTaskIdOfAttachmentsAfterCreation`) moves the file to the
 * task-scoped path and creates the Attachment row.
 *
 * Currently consumed by `PublicTaskAttachmentService.uploadFromUrl` (the public task-create
 * `<public-attachment>` marker expansion path).
 */
export class PublicAttachmentsService extends BaseService {
  async uploadFile(uploadedFile: File): Promise<{
    filePath: string
    fileName: string
    fileSize: number
    fileType: string
  }> {
    // Workspace-root path — matches the in-app pre-task-save upload location.
    const workspaceRootFilePath = `/${this.user.workspaceId}`
    const uniqueFileName = generateRandomString(uploadedFile.name)

    const attachmentsService = new AttachmentsService(this.user)
    const supabaseActions = new SupabaseActions()

    const signedUploadInfo = await attachmentsService.signUrlUpload(uniqueFileName, workspaceRootFilePath)

    const { filePayload, error: supabaseUploadError } = await supabaseActions.uploadAttachment(
      uploadedFile,
      signedUploadInfo,
      null,
    )
    if (supabaseUploadError || !filePayload) {
      throw new APIError(httpStatus.BAD_REQUEST, 'Failed to upload attachment to storage')
    }

    // Register the file with the ScrapMedia worker so it gets cleaned up if the caller never
    // embeds the returned URL in a task body. If tracking registration fails we roll back the
    // Supabase upload so the caller can retry cleanly — otherwise the file would leak permanently.
    try {
      await new ScrapMediaService(this.user).createScrapImage({ filePath: filePayload.filePath })
    } catch (scrapMediaTrackingError) {
      console.error('PublicAttachmentsService#uploadFile | Failed to register ScrapMedia, rolling back', {
        filePath: filePayload.filePath,
        error: scrapMediaTrackingError,
      })
      await supabaseActions.removeAttachment(filePayload.filePath).catch((cleanupError) => {
        console.error('PublicAttachmentsService#uploadFile | Failed to remove Supabase file during rollback', cleanupError)
      })
      throw new APIError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to register attachment for cleanup tracking')
    }

    return {
      filePath: filePayload.filePath,
      fileName: filePayload.fileName,
      fileSize: filePayload.fileSize,
      fileType: filePayload.fileType,
    }
  }
}
