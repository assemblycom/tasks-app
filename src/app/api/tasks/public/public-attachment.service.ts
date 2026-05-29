import { AttachmentsService } from '@/app/api/attachments/attachments.service'
import { BaseService } from '@api/core/services/base.service'
import { ScrapMediaService } from '@/app/api/scrap-medias/scrap-medias.service'
import APIError from '@api/core/exceptions/api'
import { MAX_UPLOAD_LIMIT } from '@/constants/attachments'
import { generateRandomString } from '@/utils/generateRandomString'
import { getSignedUrl, getUnsignedUrl } from '@/utils/signUrl'
import { sanitizeFileName } from '@/utils/sanitizeFileName'
import { SupabaseActions } from '@/utils/SupabaseActions'
import httpStatus from 'http-status'

const DOWNLOAD_TIMEOUT_MS = 8_000
const FALLBACK_FILE_NAME = 'attachment'
const FALLBACK_MIME_TYPE = 'application/octet-stream'

// only allow max of 2 attachment for task creation via public api
const MAX_PUBLIC_ATTACHMENT_MARKERS = 2

// Outer regex finds each `<public-attachment ...>` and their attributes
const MARKER_RE = /<public-attachment\b([^>]*?)\/?\s*>(\s*<\/public-attachment\s*>)?/gi
const ATTR_RE = /\b([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

interface UploadedAttachment {
  downloadUrl: string
  fileName: string
  mimeType: string
  fileSize: number
}

const escapeAttr = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const buildMarkup = (attachment: UploadedAttachment): string => {
  const url = escapeAttr(attachment.downloadUrl)
  const safeFileName = escapeAttr(attachment.fileName)
  if (attachment.mimeType.toLowerCase().startsWith('image/')) {
    return `<img alt="${safeFileName}" src="${url}" />`
  }
  // `data-src` must stay immediately before no other `src=` attribute: the post-create sweep
  // (`updateTaskIdOfAttachmentsAfterCreation`) matches `data-type="attachment"...src="(...)"`,
  // which captures this `data-src` value. Reordering so another `src=`-suffixed attr follows
  // would make the sweep grab the wrong URL and skip promotion to the task-scoped path.
  return (
    `<div data-type="attachment" data-src="${url}" data-filename="${safeFileName}"` +
    ` data-filetype="${escapeAttr(attachment.mimeType)}" data-filesize="${attachment.fileSize}" data-loading="false"></div>`
  )
}

const parseAttrs = (attrString: string): Record<string, string> => {
  const attrs: Record<string, string> = {}
  for (const match of attrString.matchAll(ATTR_RE)) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? ''
  }
  return attrs
}

/** Expands `<public-attachment>` markers in the public task-create body into real attachments. */
export class PublicTaskAttachmentService extends BaseService {
  async expandPublicAttachmentMarkers(body: string | undefined): Promise<string | undefined> {
    if (!body) return body
    const matches = [...body.matchAll(MARKER_RE)]
    if (!matches.length) return body

    if (matches.length > MAX_PUBLIC_ATTACHMENT_MARKERS) {
      throw new APIError(
        httpStatus.UNPROCESSABLE_ENTITY,
        `Too many <public-attachment> markers in description: received ${matches.length}, maximum is ${MAX_PUBLIC_ATTACHMENT_MARKERS} per task. Split the attachments across multiple task creates.`,
      )
    }

    const markers = matches.map((match, idx) => {
      const attrs = parseAttrs(match[1] ?? '')
      const src = attrs['data-src']
      if (!src) {
        throw new APIError(
          httpStatus.UNPROCESSABLE_ENTITY,
          `<public-attachment> marker at position ${idx + 1} is missing the required data-src attribute. Each marker must declare the URL to download, e.g. <public-attachment data-src="https://..." />`,
        )
      }
      return { src, fileName: attrs['data-filename'] || undefined, fileType: attrs['data-filetype'] || undefined }
    })

    // Parallel downloads — sequential would risk tripping the route's Sentry exec-time cap.
    const uploaded = await Promise.all(
      markers.map(({ src, fileName, fileType }) =>
        this.uploadFromUrl({ externalUrl: src, overrideFileName: fileName, overrideMimeType: fileType }),
      ),
    )

    let i = 0
    return body.replace(MARKER_RE, () => buildMarkup(uploaded[i++]))
  }

  /**
   * `overrideFileName` / `overrideMimeType` win over values inferred from the remote response.
   * Useful for signed-download URLs that return opaque `Content-Disposition` filenames or
   * generic `application/octet-stream`. `fileSize` is never overridable — always measured
   * from the downloaded bytes.
   */
  async uploadFromUrl(args: {
    externalUrl: string
    overrideFileName?: string
    overrideMimeType?: string
  }): Promise<UploadedAttachment & { filePath: string }> {
    const { externalUrl, overrideFileName, overrideMimeType } = args
    let parsedUrl: URL
    try {
      parsedUrl = new URL(externalUrl)
    } catch {
      throw new APIError(httpStatus.BAD_REQUEST, `Invalid attachment URL: ${externalUrl}`)
    }
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new APIError(httpStatus.BAD_REQUEST, `Attachment URL must use http(s): ${externalUrl}`)
    }

    const { response, buffer } = await fetchWithTimeout(externalUrl, {
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      maxBytes: MAX_UPLOAD_LIMIT,
    })

    const fileName = overrideFileName ?? deriveFileNameFromResponse({ parsedUrl, response })
    const mimeType = overrideMimeType ?? response.headers.get('content-type')?.split(';')[0]?.trim() ?? FALLBACK_MIME_TYPE
    const file = new File([buffer], fileName, { type: mimeType })

    const uploaded = await this.stageFile(file)
    const downloadUrl = (await getSignedUrl(uploaded.filePath)) ?? getUnsignedUrl(uploaded.filePath)
    return {
      filePath: uploaded.filePath,
      fileName: sanitizeFileName(uploaded.fileName),
      fileSize: uploaded.fileSize,
      mimeType: uploaded.fileType,
      downloadUrl,
    }
  }

  /**
   * Stages a File at the workspace-root path (same as the in-app pre-task-save flow) and
   * registers a ScrapMedia row so the file gets reaped by cron if it never makes it into a
   * task body. No Attachment row is created here — when the staged URL lands in a task body,
   * the post-create sweep (`updateTaskIdOfAttachmentsAfterCreation`) moves the file to the
   * task-scoped path and creates the Attachment row.
   */
  private async stageFile(uploadedFile: File): Promise<{
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
      console.error('PublicTaskAttachmentService#stageFile | Failed to register ScrapMedia, rolling back', {
        filePath: filePayload.filePath,
        error: scrapMediaTrackingError,
      })
      await supabaseActions.removeAttachment(filePayload.filePath).catch((cleanupError) => {
        console.error('PublicTaskAttachmentService#stageFile | Failed to remove Supabase file during rollback', cleanupError)
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

/**
 * Single abort signal covers both the fetch (header receipt) AND the body read. Without this,
 * a server that sends headers fast but trickles the body byte-by-byte would hold
 * `response.arrayBuffer()` open indefinitely. `clearTimeout` fires in `finally` after the body
 * has been fully read (or an error has propagated).
 */
async function fetchWithTimeout(
  url: string,
  { timeoutMs, maxBytes }: { timeoutMs: number; maxBytes: number },
): Promise<{ response: Response; buffer: ArrayBuffer }> {
  const abortController = new AbortController()
  const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: abortController.signal, redirect: 'follow' })
    if (!response.ok) {
      throw new APIError(
        httpStatus.BAD_REQUEST,
        `Failed to download attachment from URL: ${url} (status ${response.status})`,
      )
    }
    // Content-Length is just an upfront short-circuit; the post-download byte count below
    // is the authoritative check.
    const advertised = Number(response.headers.get('content-length') ?? NaN)
    if (Number.isFinite(advertised) && advertised > maxBytes) {
      throw new APIError(
        httpStatus.REQUEST_ENTITY_TOO_LARGE,
        `Attachment at ${url} exceeds maximum upload size of ${maxBytes} bytes`,
      )
    }
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > maxBytes) {
      throw new APIError(
        httpStatus.REQUEST_ENTITY_TOO_LARGE,
        `Attachment at ${url} exceeds maximum upload size of ${maxBytes} bytes`,
      )
    }
    return { response, buffer }
  } catch (err) {
    if (err instanceof APIError) throw err
    throw new APIError(httpStatus.BAD_REQUEST, `Failed to download attachment from URL: ${url} (${(err as Error).message})`)
  } finally {
    clearTimeout(timeoutHandle)
  }
}

function deriveFileNameFromResponse({ parsedUrl, response }: { parsedUrl: URL; response: Response }): string {
  const cd = response.headers.get('content-disposition')
  if (cd) {
    // RFC 5987 filename*=<charset>''<percent-encoded> wins over plain filename=, but only
    // decode when the declared charset is UTF-8 (or empty/default) — decodeURIComponent
    // can't handle non-UTF-8 byte sequences and would mangle ISO-8859-1 / Windows-1252.
    const encoded = cd.match(/filename\*=([^']*)''([^;]+)/i)
    if (encoded?.[2]) {
      const charset = encoded[1].trim().toUpperCase()
      if (!charset || charset === 'UTF-8') {
        try {
          return decodeURIComponent(encoded[2].trim().replace(/^"|"$/g, ''))
        } catch {
          // fall through to plain filename
        }
      }
    }
    const plain = cd.match(/filename=("([^"]+)"|([^;]+))/i)
    const plainName = plain?.[2] ?? plain?.[3]
    if (plainName) return plainName.trim()
  }
  const segment = parsedUrl.pathname.split('/').filter(Boolean).pop()
  if (segment) {
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  }
  return FALLBACK_FILE_NAME
}
