import { AttachmentTypes } from '@/types/interfaces'
import { uploadAttachmentHandler } from './attachmentUtils'

interface UploadConfig {
  /**
   * Getter for the Assembly session token. Called at upload time so that the
   * freshest token is used (the token rotates every 5 minutes via app-bridge,
   * and uploads can fire long after this config was assembled).
   */
  token?: () => string | undefined
  workspaceId?: string
  getEntityId?: () => string | null
  attachmentType?: AttachmentTypes
  parentTaskId?: string
  onUploadStart?: () => void
  onUploadEnd?: () => void
  onSuccess?: (fileUrl: string, file: File) => void | Promise<void>
}

export const createUploadFn = (config: UploadConfig) => {
  return async (file: File) => {
    config.onUploadStart?.()
    const entityId = config.getEntityId?.() ?? null //lazily loading the entityId because some of the ids are optimistic id and we want the real ids of comments/replies
    const token = config.token?.()
    if (!token || !config.workspaceId) {
      return undefined
    }
    try {
      const fileUrl = await uploadAttachmentHandler(
        file,
        token,
        config?.workspaceId ?? '',
        entityId ?? null,
        config.attachmentType,
        config.parentTaskId,
      )

      if (fileUrl) {
        await config.onSuccess?.(fileUrl, file)
      }

      return fileUrl
    } finally {
      config.onUploadEnd?.()
    }
  }
}
