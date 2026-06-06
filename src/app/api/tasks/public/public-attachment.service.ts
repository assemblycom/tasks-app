import { AttachmentsService } from '@/app/api/attachments/attachments.service'
import { BaseService } from '@api/core/services/base.service'
import { ScrapMediaService } from '@/app/api/scrap-medias/scrap-medias.service'
import APIError from '@api/core/exceptions/api'
import { MAX_UPLOAD_LIMIT } from '@/constants/attachments'
import { generateRandomString } from '@/utils/generateRandomString'
import { getSignedUrl, getUnsignedUrl } from '@/utils/signUrl'
import { sanitizeFileName } from '@/utils/sanitizeFileName'
import { SupabaseActions } from '@/utils/SupabaseActions'
import { JSDOM } from 'jsdom'
import httpStatus from 'http-status'

const DOWNLOAD_TIMEOUT_MS = 8_000
const FALLBACK_FILE_NAME = 'attachment'
const FALLBACK_MIME_TYPE = 'application/octet-stream'

// only allow max of 2 attachment for task creation via public api
const MAX_PUBLIC_ATTACHMENT_MARKERS = 2

interface UploadedAttachment {
  downloadUrl: string
  fileName: string
  mimeType: string
  fileSize: number
}

/**
 * Builds the attachment DOM node the task editor recognizes. Attribute escaping is handled by
 * `setAttribute` + serialization, so raw values are safe to pass in.
 */
const createAttachmentNode = (document: Document, attachment: UploadedAttachment): Element => {
  if (attachment.mimeType.toLowerCase().startsWith('image/')) {
    const img = document.createElement('img')
    img.setAttribute('alt', attachment.fileName)
    img.setAttribute('src', attachment.downloadUrl)
    return img
  }
  // Keep `data-src` the only src-suffixed attribute: the post-create sweep grabs the last
  // `src="..."` in the tag, and `data-src` is what it must capture to promote the file.
  const div = document.createElement('div')
  div.setAttribute('data-type', 'attachment')
  div.setAttribute('data-src', attachment.downloadUrl)
  div.setAttribute('data-filename', attachment.fileName)
  div.setAttribute('data-filetype', attachment.mimeType)
  div.setAttribute('data-filesize', String(attachment.fileSize))
  div.setAttribute('data-loading', 'false')
  return div
}

/** Expands `<public-attachment>` markers in the public task-create body into real attachments. */
export class PublicTaskAttachmentService extends BaseService {
  async expandPublicAttachmentMarkers(body: string | undefined): Promise<string | undefined> {
    if (!body) return body

    // Parse as a DOM rather than regex over the raw string. `<public-attachment>` is a custom
    // element, NOT a void element, so a `<.../>` marker is parsed as an open tag whose following
    // siblings become its children — the same way the editor parses it. Operating on the DOM lets
    // us read attributes reliably and hoist any mis-nested content back out when we swap the node.
    const dom = new JSDOM(body)
    const { document } = dom.window
    const markerEls = Array.from(document.querySelectorAll('public-attachment'))
    if (!markerEls.length) return body

    if (markerEls.length > MAX_PUBLIC_ATTACHMENT_MARKERS) {
      throw new APIError(
        httpStatus.UNPROCESSABLE_ENTITY,
        `Too many <public-attachment> markers in description: received ${markerEls.length}, maximum is ${MAX_PUBLIC_ATTACHMENT_MARKERS} per task.`,
      )
    }

    const markers = markerEls.map((el, idx) => {
      const src = el.getAttribute('data-src')
      if (!src) {
        throw new APIError(
          httpStatus.UNPROCESSABLE_ENTITY,
          `<public-attachment> marker at position ${idx + 1} is missing the required data-src attribute. Each marker must declare the URL to download, e.g. <public-attachment data-src="https://..." />`,
        )
      }
      return {
        src,
        fileName: el.getAttribute('data-filename') || undefined,
        fileType: el.getAttribute('data-filetype') || undefined,
      }
    })

    // Parallel downloads — sequential would risk tripping the route's Sentry exec-time cap.
    const uploaded = await Promise.all(
      markers.map(({ src, fileName, fileType }) =>
        this.uploadFromUrl({ externalUrl: src, overrideFileName: fileName, overrideMimeType: fileType }),
      ),
    )

    markerEls.forEach((el, i) => {
      const attachmentNode = createAttachmentNode(document, uploaded[i])
      // Replace the marker with the attachment node, preserving any content the parser mis-nested
      // inside the (non-void) marker by re-emitting those children as following siblings.
      el.replaceWith(attachmentNode, ...Array.from(el.childNodes))
    })

    return document.body.innerHTML
  }

  /**
   * `overrideFileName` / `overrideMimeType` win over values inferred from the response (useful for
   * signed URLs with opaque filenames or generic mime types). `fileSize` is always the byte count.
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
   * Stages a File at the workspace-root path and registers a ScrapMedia row so cron reaps it if
   * it never lands in a task body. The post-create sweep moves it to the task-scoped path and
   * creates the Attachment row.
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

    // Track with ScrapMedia for cron cleanup; if that fails, roll back the upload so it can't leak.
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

/** One abort signal bounds both header receipt and the body read, so a slow-trickle body can't hang `arrayBuffer()`. */
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
    // RFC 5987 filename*= wins over plain filename=, but only decode when the charset is UTF-8 —
    // decodeURIComponent can't handle other byte sequences (ISO-8859-1 / Windows-1252).
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
