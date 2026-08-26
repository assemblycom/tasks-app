import { AttachmentTypes, ISignedUrlUpload } from '@/types/interfaces'
import { generateRandomString } from '@/utils/generateRandomString'
import { SupabaseActions } from '@/utils/SupabaseActions'
import { postScrapMedia } from '@/app/detail/[task_id]/[user_type]/actions'
import { ScrapMediaRequest } from '@/types/common'
import { getFilePathFromUrl } from '@/utils/signedUrlReplacer'

import { getSignedUrlFile, getSignedUrlUpload } from '@/app/(home)/actions'
import { CreateAttachmentRequestSchema } from '@/types/dto/attachments.dto'

const buildFilePath = (
  workspaceId: string,
  type: AttachmentTypes[keyof AttachmentTypes],
  entityId: string | null,
  parentTaskId?: string,
) => {
  if (type === AttachmentTypes.TASK) {
    return entityId ? `/${workspaceId}/${entityId}` : `/${workspaceId}`
  } else if (type === AttachmentTypes.COMMENT) {
    return `/${workspaceId}/${parentTaskId}/comments${entityId ? `/${entityId}` : ''}`
  }
  return `/${workspaceId}/templates${entityId ? `/${entityId}` : ''}`
}

const UPLOAD_MAX_ATTEMPTS = 3

export const uploadAttachmentHandler = async (
  file: File,
  token: string,
  workspaceId: string,
  entityId: string | null,
  type: AttachmentTypes[keyof AttachmentTypes] = AttachmentTypes.TASK,
  parentTaskId?: string,
): Promise<string | undefined> => {
  const supabaseActions = new SupabaseActions()
  const fileName = generateRandomString(file.name)
  const storagePath = buildFilePath(workspaceId, type, entityId, parentTaskId)

  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const signedUrl: ISignedUrlUpload = await getSignedUrlUpload(token, fileName, storagePath)
      const { filePayload, error } = await supabaseActions.uploadAttachment(file, signedUrl, entityId)

      if (filePayload) {
        return getSignedUrlFile(token ?? '', filePayload.filePath ?? '')
      }

      if (error) {
        console.error(`Upload attempt ${attempt}/${UPLOAD_MAX_ATTEMPTS} failed:`, error)
      }
    } catch (error) {
      console.error(`Upload attempt ${attempt}/${UPLOAD_MAX_ATTEMPTS} failed:`, error)
    }
  }

  return Promise.reject(new Error('File upload failed'))
}

export const deleteEditorAttachmentsHandler = async (
  url: string,
  token: string,
  entityType: AttachmentTypes,
  entityId?: string,
  customFilePath?: string, //used only for comments and replies. Because newly created comments and replies have mismatched urls. And the url doesnt refresh without a page refresh.
) => {
  const filePath = getFilePathFromUrl(url)
  if (filePath) {
    const payload: ScrapMediaRequest = {
      filePath: customFilePath ?? filePath,
      ...(entityType === AttachmentTypes.TASK
        ? { taskId: entityId }
        : entityType === AttachmentTypes.TEMPLATE
          ? { templateId: entityId }
          : { commentId: entityId }),
    }
    postScrapMedia(token, payload)
  }
}

export const getAttachmentPayload = (
  fileUrl: string,
  file: File,
  id: string,
  entity: AttachmentTypes[keyof AttachmentTypes] = AttachmentTypes.TASK,
) => {
  const filePath = getFilePathFromUrl(fileUrl)

  const payload = entity === AttachmentTypes.COMMENT ? { commentId: id } : { taskId: id }

  return CreateAttachmentRequestSchema.parse({
    ...payload,
    filePath,
    fileSize: file.size,
    fileType: file.type,
    fileName: file.name,
  })
}

export const getFileNameFromPath = (path: string): string => {
  const segments = path.split('/').filter(Boolean)
  return segments[segments.length - 1] || ''
}

export const getCustomFilePath = (workspaceId: string, task_id: string, commentId: string, url: string) => {
  const filePath = getFilePathFromUrl(url)
  if (!filePath) {
    return undefined
  }
  const fileName = getFileNameFromPath(filePath)
  return `${workspaceId}/${task_id}/comments/${commentId}/${fileName}`
}
