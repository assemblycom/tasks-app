import { AttachmentsService } from '@/app/api/attachments/attachments.service'
import { BaseService } from '@api/core/services/base.service'
import { ScrapMediaService } from '@/app/api/scrap-medias/scrap-medias.service'
import { generateRandomString } from '@/utils/generateRandomString'
import { SupabaseActions } from '@/utils/SupabaseActions'
import APIError from '@api/core/exceptions/api'
import httpStatus from 'http-status'

/**
 * Server-side orchestrator that condenses the in-app 3-hop upload flow
 * (request signed URL → PUT to Supabase → POST attachment row) into a
 * single multipart POST suitable for public API callers.
 *
 * No Attachment row is created here — the file lands at the workspace-root
 * path (same as the in-app pre-task-save flow) and a ScrapMedia row is
 * registered so the file gets reaped if the caller never embeds it in a
 * task body. When the caller does embed the returned downloadUrl in a task
 * description, the existing post-create body sweep creates the Attachment
 * row and moves the file to the task-scoped path.
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
