import { PublicAttachmentsService } from '@/app/api/attachments/public/public.service'
import { BaseService } from '@api/core/services/base.service'
import APIError from '@api/core/exceptions/api'
import { MAX_UPLOAD_LIMIT } from '@/constants/attachments'
import { getSignedUrl, getUnsignedUrl } from '@/utils/signUrl'
import { sanitizeFileName } from '@/utils/sanitizeFileName'
import httpStatus from 'http-status'

const DOWNLOAD_TIMEOUT_MS = 8_000
const FALLBACK_FILE_NAME = 'attachment'
const FALLBACK_MIME_TYPE = 'application/octet-stream'
// Per-request cap. Each marker triggers a parallel external fetch + Supabase upload — without
// a bound an authenticated caller could submit a body with hundreds of markers and exhaust
// the function's concurrency / wall-time budget.
const MAX_PUBLIC_ATTACHMENT_MARKERS = 10

// Outer regex finds each `<public-attachment ...>` marker; inner regex extracts attributes
// from the captured attribute string in any order, both quote styles. Not parsed by an HTML
// parser because custom elements aren't void per HTML5 — JSDOM would pull following siblings
// into the marker as children, and re-serializing would normalize the whole body.
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
  if (attachment.mimeType.toLowerCase().startsWith('image/')) {
    return `<img src="${url}" />`
  }
  return (
    `<div data-type="attachment" data-src="${url}" data-filename="${escapeAttr(attachment.fileName)}"` +
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

/**
 * Expands `<public-attachment data-src="..." />` markers in the public task-create body. Each
 * marker's URL is downloaded, staged at workspace-root via `PublicAttachmentsService.uploadFile`
 * (ScrapMedia-tracked so failed creates get reaped by cron), then swapped for the proper Tiptap
 * node — `<img>` for image mimes, attachment div otherwise. The existing post-create body sweep
 * then promotes staged files to the task-scoped path and creates Attachment rows.
 */
export class PublicTaskAttachmentService extends BaseService {
  async expandPublicAttachmentMarkers(body: string | undefined): Promise<string | undefined> {
    if (!body) return body
    const matches = [...body.matchAll(MARKER_RE)]
    if (!matches.length) return body

    if (matches.length > MAX_PUBLIC_ATTACHMENT_MARKERS) {
      throw new APIError(
        httpStatus.BAD_REQUEST,
        `Too many <public-attachment> markers (${matches.length}); max ${MAX_PUBLIC_ATTACHMENT_MARKERS} per task`,
      )
    }

    const markers = matches.map((match, idx) => {
      const attrs = parseAttrs(match[1] ?? '')
      const src = attrs['data-src']
      if (!src) {
        throw new APIError(
          httpStatus.BAD_REQUEST,
          `<public-attachment> marker #${idx + 1} is missing required data-src attribute`,
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

    // Single abort signal covers both fetch (header receipt) AND body read. Without this,
    // a malicious server that returns headers fast but trickles the body byte-by-byte would
    // hold response.arrayBuffer() open indefinitely. clearTimeout fires in an outer finally
    // after the body has been fully read.
    const abortController = new AbortController()
    const timeoutHandle = setTimeout(() => abortController.abort(), DOWNLOAD_TIMEOUT_MS)
    let buffer: ArrayBuffer
    let response: Response
    try {
      response = await fetch(externalUrl, { signal: abortController.signal, redirect: 'follow' })
      if (!response.ok) {
        throw new APIError(
          httpStatus.BAD_REQUEST,
          `Failed to download attachment from URL: ${externalUrl} (status ${response.status})`,
        )
      }

      // Content-Length is just an upfront short-circuit; the post-download byte count below
      // is the authoritative check.
      const advertised = Number(response.headers.get('content-length') ?? NaN)
      if (Number.isFinite(advertised) && advertised > MAX_UPLOAD_LIMIT) {
        throw new APIError(
          httpStatus.REQUEST_ENTITY_TOO_LARGE,
          `Attachment at ${externalUrl} exceeds maximum upload size of ${MAX_UPLOAD_LIMIT} bytes`,
        )
      }

      buffer = await response.arrayBuffer()
    } catch (err) {
      if (err instanceof APIError) throw err
      throw new APIError(
        httpStatus.BAD_REQUEST,
        `Failed to download attachment from URL: ${externalUrl} (${(err as Error).message})`,
      )
    } finally {
      clearTimeout(timeoutHandle)
    }

    if (buffer.byteLength > MAX_UPLOAD_LIMIT) {
      throw new APIError(
        httpStatus.REQUEST_ENTITY_TOO_LARGE,
        `Attachment at ${externalUrl} exceeds maximum upload size of ${MAX_UPLOAD_LIMIT} bytes`,
      )
    }

    const fileName = overrideFileName ?? deriveFileNameFromResponse(parsedUrl, response)
    const mimeType = overrideMimeType ?? response.headers.get('content-type')?.split(';')[0]?.trim() ?? FALLBACK_MIME_TYPE
    const file = new File([buffer], fileName, { type: mimeType })

    const uploaded = await new PublicAttachmentsService(this.user).uploadFile(file)
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
