export interface TaskAppUploadedAttachment {
  downloadUrl: string
  fileName: string
  mimeType: string
  fileSize: number
}

const escapeHtmlAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const buildTaskAppAttachmentMarkup = (attachment: TaskAppUploadedAttachment): string => {
  const url = escapeHtmlAttribute(attachment.downloadUrl)
  if (attachment.mimeType.toLowerCase().startsWith('image/')) {
    return `<img src="${url}" />`
  }
  const safeFileName = escapeHtmlAttribute(attachment.fileName)
  const safeMimeType = escapeHtmlAttribute(attachment.mimeType)
  return (
    `<div data-type="attachment" data-src="${url}" data-filename="${safeFileName}"` +
    ` data-filetype="${safeMimeType}" data-filesize="${attachment.fileSize}" data-loading="false"></div>`
  )
}

// API-only marker: senders embed external attachment URLs in the task body via
// `<public-attachment src="https://..." />`. The server downloads each src, uploads to our
// storage, then swaps the marker out for the proper Tiptap node (img for image mime types,
// attachment div otherwise). Both quote styles and the paired closing form are tolerated.
const PUBLIC_ATTACHMENT_MARKER_REGEX =
  /<public-attachment\b[^>]*?\bsrc=(?:"([^"]*)"|'([^']*)')[^>]*?\/?\s*>(\s*<\/public-attachment\s*>)?/gi

export const extractPublicAttachmentUrls = (body: string): string[] => {
  const urls: string[] = []
  for (const match of body.matchAll(PUBLIC_ATTACHMENT_MARKER_REGEX)) {
    const url = match[1] ?? match[2]
    if (url) urls.push(url)
  }
  return urls
}

export const replacePublicAttachmentMarkers = (body: string, attachments: TaskAppUploadedAttachment[]): string => {
  let index = 0
  return body.replace(PUBLIC_ATTACHMENT_MARKER_REGEX, () => {
    const attachment = attachments[index]
    index += 1
    return attachment ? buildTaskAppAttachmentMarkup(attachment) : ''
  })
}
