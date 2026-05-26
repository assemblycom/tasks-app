import APIError from '@/app/api/core/exceptions/api'
import type { AttachmentsService } from '@/app/api/attachments/attachments.service'
import { getFilePathFromUrl, normalizeAttachmentFilePath } from '@/utils/signedUrlReplacer'
import { getSignedUrl } from '@/utils/signUrl'
import { Attachment } from '@prisma/client'
import httpStatus from 'http-status'

/**
 * Bidirectional translator for the public-API attachment placeholder tag.
 *
 *   Wire format (what callers send/receive):
 *     <public-attachment id="<uuid>" />
 *
 *   Native format (what is stored in task.body so Tapwrite/tiptap can render it):
 *     <img src="<signed-url>" />                                       (image mime types)
 *     <div data-type="attachment"                                       (everything else)
 *          data-src="<signed-url>"
 *          data-filename="..." data-filetype="..." data-filesize="..."
 *          data-loading="false">
 *       <attachment-view src="<signed-url>" filename="..." filetype="..."
 *           filesize="..." target="_blank" rel="noopener noreferrer">
 *         <filename>
 *       </attachment-view>
 *     </div>
 *
 * The non-image markup mirrors what Tapwrite emits in-app — the renderer reads
 * data-filename / data-filesize / data-filetype to display file metadata
 * (without them the UI shows "NaN KB" / generic fallback). The <attachment-view>
 * mirror is what users actually click on.
 */

const PUBLIC_ATTACHMENT_TAG_REGEX = /<public-attachment\s+[^>]*\bid="([^"]+)"[^>]*(?:\/>|>(?:\s*)<\/public-attachment>|>)/gi

const NATIVE_IMAGE_TAG_REGEX = /<img\s+[^>]*src="([^"]+)"[^>]*\/?>/gi
const NATIVE_ATTACHMENT_TAG_REGEX =
  /<\s*([a-zA-Z]+)\s+[^>]*data-type="attachment"[^>]*src="([^"]+)"[^>]*>(?:[\s\S]*?<\/\1\s*>)?/gi
const EMPTY_PARAGRAPH_REGEX = /<p>\s*<\/p>/gi

const isImageMimeType = (mimeType: string): boolean => mimeType.toLowerCase().startsWith('image/')

// Minimal HTML attribute / text escaper. Attachment filenames can contain
// quotes, ampersands, and angle brackets; unescaped they break the surrounding
// attribute or get reinterpreted as markup.
const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const renderNativeAttachmentMarkup = ({ attachment, signedUrl }: { attachment: Attachment; signedUrl: string }): string => {
  if (isImageMimeType(attachment.fileType)) {
    return `<img src="${signedUrl}" />`
  }
  const safeFileName = escapeHtml(attachment.fileName)
  const safeFileType = escapeHtml(attachment.fileType)
  const safeUrl = escapeHtml(signedUrl)
  const fileSize = attachment.fileSize
  return (
    `<div data-type="attachment"` +
    ` data-src="${safeUrl}"` +
    ` data-filename="${safeFileName}"` +
    ` data-filetype="${safeFileType}"` +
    ` data-filesize="${fileSize}"` +
    ` data-loading="false">` +
    `<attachment-view src="${safeUrl}"` +
    ` filename="${safeFileName}"` +
    ` filetype="${safeFileType}"` +
    ` filesize="${fileSize}"` +
    ` target="_blank" rel="noopener noreferrer">${safeFileName}</attachment-view>` +
    `</div>`
  )
}

const extractPublicAttachmentIdsFromDescription = (description: string): string[] => {
  const matchedAttachmentIds: string[] = []
  let regexMatch: RegExpExecArray | null
  PUBLIC_ATTACHMENT_TAG_REGEX.lastIndex = 0
  while ((regexMatch = PUBLIC_ATTACHMENT_TAG_REGEX.exec(description)) !== null) {
    matchedAttachmentIds.push(regexMatch[1])
  }
  return matchedAttachmentIds
}

/**
 * Replace every <public-attachment id="..." /> tag with the native markup
 * Tapwrite expects. Throws if any referenced id is missing, already bound
 * to another task/comment, or belongs to a different workspace.
 *
 * Returns the expanded HTML alongside the list of resolved orphan attachments
 * so the caller can apply post-bind side effects (currently handled by the
 * in-app post-create body sweep, which detects them via filePath).
 */
export const expandPublicAttachmentTagsInDescription = async ({
  description,
  attachmentsService,
}: {
  description: string | undefined
  attachmentsService: AttachmentsService
}): Promise<{ expandedDescription: string; resolvedOrphanAttachments: Attachment[] }> => {
  if (!description) {
    return { expandedDescription: description ?? '', resolvedOrphanAttachments: [] }
  }

  const referencedAttachmentIds = extractPublicAttachmentIdsFromDescription(description)
  if (referencedAttachmentIds.length === 0) {
    return { expandedDescription: description, resolvedOrphanAttachments: [] }
  }

  const uniqueReferencedAttachmentIds = Array.from(new Set(referencedAttachmentIds))
  const resolvedOrphanAttachments = await attachmentsService.findOrphanAttachmentsByIds(uniqueReferencedAttachmentIds)

  const unresolvedAttachmentIds = uniqueReferencedAttachmentIds.filter(
    (referencedId) => !resolvedOrphanAttachments.some((resolved) => resolved.id === referencedId),
  )
  if (unresolvedAttachmentIds.length > 0) {
    throw new APIError(
      httpStatus.BAD_REQUEST,
      `Referenced attachment(s) not found, already bound to another task, or not accessible: ${unresolvedAttachmentIds.join(', ')}`,
    )
  }

  const attachmentByIdLookup = new Map(resolvedOrphanAttachments.map((row) => [row.id, row]))

  const signedUrlByAttachmentId = new Map<string, string>()
  await Promise.all(
    resolvedOrphanAttachments.map(async (orphanAttachment) => {
      const signedDownloadUrl = await getSignedUrl(orphanAttachment.filePath)
      if (!signedDownloadUrl) {
        throw new APIError(
          httpStatus.INTERNAL_SERVER_ERROR,
          `Failed to sign download URL for attachment ${orphanAttachment.id}`,
        )
      }
      signedUrlByAttachmentId.set(orphanAttachment.id, signedDownloadUrl)
    }),
  )

  PUBLIC_ATTACHMENT_TAG_REGEX.lastIndex = 0
  const expandedDescription = description.replace(PUBLIC_ATTACHMENT_TAG_REGEX, (_fullMatch, attachmentId: string) => {
    const matchedAttachment = attachmentByIdLookup.get(attachmentId)
    const signedDownloadUrl = signedUrlByAttachmentId.get(attachmentId)
    if (!matchedAttachment || !signedDownloadUrl) return ''
    return renderNativeAttachmentMarkup({ attachment: matchedAttachment, signedUrl: signedDownloadUrl })
  })

  return { expandedDescription, resolvedOrphanAttachments }
}

/**
 * Reverse direction: replace every native attachment tag in the stored body
 * with the wire-format <public-attachment id="..." /> placeholder, using
 * the task's own attachments list to map src filePath → attachment id.
 *
 * Native tags whose src doesn't match any known attachment are stripped,
 * mirroring the legacy sanitizeHtml behavior. Empty paragraphs are also
 * collapsed.
 */
export const collapseNativeAttachmentTagsToPublicTags = ({
  body,
  taskAttachments,
}: {
  body: string | null | undefined
  taskAttachments: Attachment[]
}): string => {
  if (!body) return ''

  const attachmentByFilePath = new Map(
    taskAttachments.map((attachment) => [normalizeAttachmentFilePath(attachment.filePath), attachment]),
  )

  const findAttachmentBySrc = (srcUrl: string): Attachment | undefined => {
    const filePathFromSrc = getFilePathFromUrl(srcUrl)
    if (!filePathFromSrc) return undefined
    return attachmentByFilePath.get(normalizeAttachmentFilePath(filePathFromSrc))
  }

  let collapsedBody = body.replace(NATIVE_IMAGE_TAG_REGEX, (_fullMatch, imageSrc: string) => {
    const matchedAttachment = findAttachmentBySrc(imageSrc)
    return matchedAttachment ? `<public-attachment id="${matchedAttachment.id}" />` : ''
  })

  collapsedBody = collapsedBody.replace(
    NATIVE_ATTACHMENT_TAG_REGEX,
    (_fullMatch, _tagName: string, attachmentSrc: string) => {
      const matchedAttachment = findAttachmentBySrc(attachmentSrc)
      return matchedAttachment ? `<public-attachment id="${matchedAttachment.id}" />` : ''
    },
  )

  collapsedBody = collapsedBody.replace(EMPTY_PARAGRAPH_REGEX, '')

  return collapsedBody
}
