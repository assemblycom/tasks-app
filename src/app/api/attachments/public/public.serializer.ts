import { PublicAttachmentDto } from '@/app/api/attachments/public/public.dto'
import { RFC3339DateSchema } from '@/types/common'
import { toRFC3339 } from '@/utils/dateHelper'
import { sanitizeFileName } from '@/utils/sanitizeFileName'
import { createSignedUrls } from '@/utils/signUrl'
import { Attachment, CommentInitiator } from '@prisma/client'
import z from 'zod'

export class PublicAttachmentSerializer {
  /**
   *
   * @param attachments array of Attachment
   * @param uploadedBy id of the one who commented
   * @param uploadedByUserType usertype of the one who commented
   * @returns Array of PublicAttachmentDto
   */
  static async serializeAttachments({
    attachments,
    uploadedByUserType,
    content,
    uploadedBy,
  }: {
    attachments: Attachment[]
    uploadedByUserType: CommentInitiator
    content: string | null
    uploadedBy?: string
  }): Promise<PublicAttachmentDto[]> {
    // check if attachments are in the content. If yes
    const attachmentPaths = attachments
      .map((attachment) => {
        return attachment.filePath
      })
      .filter((path) => content?.includes(path))

    const signedUrls = await PublicAttachmentSerializer.getFormattedSignedUrls(attachmentPaths)

    return attachments
      .map((attachment) => {
        const url = signedUrls.find((item) => item.path === attachment.filePath)?.url
        if (!url) return null
        return {
          id: attachment.id,
          fileName: sanitizeFileName(attachment.fileName),
          fileSize: attachment.fileSize,
          mimeType: attachment.fileType,
          downloadUrl: attachment.deletedAt
            ? null
            : z
                .string()
                .url({ message: `Invalid downloadUrl for attachment with id ${attachment.id}` })
                .parse(url),
          uploadedBy: uploadedBy || attachment.createdById,
          uploadedByUserType: uploadedByUserType,
          uploadedDate: RFC3339DateSchema.parse(toRFC3339(attachment.createdAt)),
        }
      })
      .filter((attachment) => attachment !== null)
  }

  static async getFormattedSignedUrls(attachmentPaths: string[]) {
    if (!attachmentPaths.length) return []
    const signedUrls = await createSignedUrls(attachmentPaths)
    return signedUrls.map((item) => ({ path: item.path, url: item.signedUrl }))
  }
}
