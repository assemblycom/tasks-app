export interface TaskAppUploadedAttachment {
  downloadUrl: string
  fileName: string
  mimeType: string
  fileSize: number
}

export interface PublicAttachmentMarker {
  src: string
  fileName?: string
  fileType?: string
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

// API-only marker. Callers embed external URLs via
// `<public-attachment data-src="https://..." [data-filename="..."] [data-filetype="..."] />`.
// Tolerates both quote styles, any attribute order, and the paired closing form.
// Not parsed by an HTML parser because custom elements aren't void per HTML5 — JSDOM would
// pull following siblings into the marker as children. Bounded attribute set + known shape
// keeps regex tractable and matches the codebase's pre-existing body-scanning style.
const PUBLIC_ATTACHMENT_MARKER_REGEX = /<public-attachment\b([^>]*?)\/?\s*>(\s*<\/public-attachment\s*>)?/gi
const ATTRIBUTE_REGEX = /\b([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

const parseMarkerAttributes = (attributeString: string): Record<string, string> => {
  const attrs: Record<string, string> = {}
  for (const match of attributeString.matchAll(ATTRIBUTE_REGEX)) {
    const name = match[1].toLowerCase()
    const value = match[2] ?? match[3] ?? ''
    attrs[name] = value
  }
  return attrs
}

export const extractPublicAttachmentMarkers = (body: string): PublicAttachmentMarker[] => {
  const markers: PublicAttachmentMarker[] = []
  for (const match of body.matchAll(PUBLIC_ATTACHMENT_MARKER_REGEX)) {
    const attrs = parseMarkerAttributes(match[1] ?? '')
    markers.push({
      src: attrs['data-src'] ?? '',
      fileName: attrs['data-filename'] || undefined,
      fileType: attrs['data-filetype'] || undefined,
    })
  }
  return markers
}

export const replacePublicAttachmentMarkers = (body: string, attachments: TaskAppUploadedAttachment[]): string => {
  let index = 0
  return body.replace(PUBLIC_ATTACHMENT_MARKER_REGEX, () => {
    const attachment = attachments[index]
    index += 1
    return attachment ? buildTaskAppAttachmentMarkup(attachment) : ''
  })
}
