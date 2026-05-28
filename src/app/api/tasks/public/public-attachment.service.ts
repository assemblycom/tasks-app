import { PublicAttachmentsService } from '@/app/api/attachments/public/public.service'
import { BaseService } from '@api/core/services/base.service'
import APIError from '@api/core/exceptions/api'
import { MAX_UPLOAD_LIMIT } from '@/constants/attachments'
import { getSignedUrl, getUnsignedUrl } from '@/utils/signUrl'
import { sanitizeFileName } from '@/utils/sanitizeFileName'
import {
  TaskAppUploadedAttachment,
  extractPublicAttachmentMarkers,
  replacePublicAttachmentMarkers,
} from '@api/tasks/public/buildTaskAppAttachmentMarkup'
import httpStatus from 'http-status'

const DOWNLOAD_TIMEOUT_MS = 8_000
const FALLBACK_FILE_NAME = 'attachment'
const FALLBACK_MIME_TYPE = 'application/octet-stream'

/**
 * Expands `<public-attachment src="..." />` markers in the public task-create body into real
 * attachments. Each marker's `src` is downloaded, staged at the workspace-root via
 * `PublicAttachmentsService.uploadFile` (which registers ScrapMedia cleanup so a failed
 * task create gets reaped by the cron worker), and the marker is replaced with the proper
 * Tiptap markup — `<img>` for image mime types, attachment div otherwise. The existing
 * post-create body sweep then promotes the staged files to the task-scoped path and
 * creates the Attachment rows.
 */
export class PublicTaskAttachmentService extends BaseService {
  /**
   * Replace every `<public-attachment src="..." />` marker in `body` with the rendered
   * Tiptap markup for the downloaded file. Returns `body` unchanged when it contains no
   * markers (or is undefined) so the caller stays a one-liner.
   */
  async expandPublicAttachmentMarkers(body: string | undefined): Promise<string | undefined> {
    if (!body) return body
    const markers = extractPublicAttachmentMarkers(body)
    if (!markers.length) return body

    markers.forEach((marker, idx) => {
      if (!marker.src) {
        throw new APIError(
          httpStatus.BAD_REQUEST,
          `<public-attachment> marker #${idx + 1} is missing required data-src attribute`,
        )
      }
    })

    // Parallel downloads — sequential would risk tripping the route's Sentry exec-time cap
    // (and is wasted wall time even when no cap is hit).
    const uploaded = await Promise.all(
      markers.map((marker) =>
        this.uploadFromUrl({
          externalUrl: marker.src,
          overrideFileName: marker.fileName,
          overrideMimeType: marker.fileType,
        }),
      ),
    )
    return replacePublicAttachmentMarkers(body, uploaded)
  }

  /**
   * Download a remote file by URL and stage it through the same workspace-root upload path as
   * the in-app pre-task-save flow. Returns the same fields as `PublicAttachmentsService.uploadFile`
   * plus a `downloadUrl` ready to embed in the task body.
   *
   * `overrideFileName` / `overrideMimeType` win over the values inferred from the remote
   * response. Callers pass these when they have ground truth the remote server can't supply
   * (e.g., signed-download URLs that return opaque `Content-Disposition` filenames or generic
   * `application/octet-stream`). `fileSize` is never overridable — it's always measured from
   * the downloaded bytes.
   */
  async uploadFromUrl(args: {
    externalUrl: string
    overrideFileName?: string
    overrideMimeType?: string
  }): Promise<TaskAppUploadedAttachment & { filePath: string }> {
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

    const abortController = new AbortController()
    const timeoutHandle = setTimeout(() => abortController.abort(), DOWNLOAD_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(externalUrl, { signal: abortController.signal, redirect: 'follow' })
    } catch (err) {
      throw new APIError(
        httpStatus.BAD_REQUEST,
        `Failed to download attachment from URL: ${externalUrl} (${(err as Error).message})`,
      )
    } finally {
      clearTimeout(timeoutHandle)
    }

    if (!response.ok) {
      throw new APIError(
        httpStatus.BAD_REQUEST,
        `Failed to download attachment from URL: ${externalUrl} (status ${response.status})`,
      )
    }

    // Trust Content-Length only for an upfront short-circuit; the post-download byte count is
    // the authoritative size check below.
    const advertisedLength = response.headers.get('content-length')
    if (advertisedLength) {
      const advertisedSize = Number(advertisedLength)
      if (Number.isFinite(advertisedSize) && advertisedSize > MAX_UPLOAD_LIMIT) {
        throw new APIError(
          httpStatus.REQUEST_ENTITY_TOO_LARGE,
          `Attachment at ${externalUrl} exceeds maximum upload size of ${MAX_UPLOAD_LIMIT} bytes`,
        )
      }
    }

    const downloadedBuffer = await response.arrayBuffer()
    if (downloadedBuffer.byteLength > MAX_UPLOAD_LIMIT) {
      throw new APIError(
        httpStatus.REQUEST_ENTITY_TOO_LARGE,
        `Attachment at ${externalUrl} exceeds maximum upload size of ${MAX_UPLOAD_LIMIT} bytes`,
      )
    }

    const fileName = overrideFileName ?? deriveFileNameFromResponse(parsedUrl, response)
    const mimeType = overrideMimeType ?? response.headers.get('content-type')?.split(';')[0]?.trim() ?? FALLBACK_MIME_TYPE
    const downloadedFile = new File([downloadedBuffer], fileName, { type: mimeType })

    const uploaded = await new PublicAttachmentsService(this.user).uploadFile(downloadedFile)
    const downloadUrl = (await getSignedUrl(uploaded.filePath)) ?? getUnsignedUrl(uploaded.filePath)
    return {
      filePath: uploaded.filePath,
      fileName: sanitizeFileName(uploaded.fileName),
      fileSize: uploaded.fileSize,
      mimeType: uploaded.fileType,
      downloadUrl,
    }
  }
}

function deriveFileNameFromResponse(parsedUrl: URL, response: Response): string {
  const contentDisposition = response.headers.get('content-disposition')
  if (contentDisposition) {
    // RFC 5987 filename*=UTF-8''... takes precedence over plain filename=
    const encodedMatch = contentDisposition.match(/filename\*=([^']*)''([^;]+)/i)
    if (encodedMatch?.[2]) {
      try {
        return decodeURIComponent(encodedMatch[2].trim().replace(/^"|"$/g, ''))
      } catch {
        // fall through to plain filename
      }
    }
    const plainMatch = contentDisposition.match(/filename=("([^"]+)"|([^;]+))/i)
    const plainName = plainMatch?.[2] ?? plainMatch?.[3]
    if (plainName) return plainName.trim()
  }
  const pathSegment = parsedUrl.pathname.split('/').filter(Boolean).pop()
  if (pathSegment) {
    try {
      return decodeURIComponent(pathSegment)
    } catch {
      return pathSegment
    }
  }
  return FALLBACK_FILE_NAME
}
