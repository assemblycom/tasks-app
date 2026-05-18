type FetchOptions = RequestInit & {
  next?: { tags?: string[] }
}

const ERROR_BODY_PREVIEW_LENGTH = 300

const getRequestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString()
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url
  return String(input)
}

const redactToken = (value: string): string => value.replace(/([?&]token=)[^&\s]+/g, '$1[redacted]')

const getRedactedRequestUrl = (input: RequestInfo | URL): string => {
  const url = getRequestUrl(input)

  try {
    const parsedUrl = new URL(url, 'http://localhost')
    if (parsedUrl.searchParams.has('token')) {
      parsedUrl.searchParams.set('token', '[redacted]')
    }

    if (url.startsWith('/')) return `${parsedUrl.pathname}${parsedUrl.search}`
    return parsedUrl.toString().replaceAll('%5Bredacted%5D', '[redacted]')
  } catch {
    return redactToken(url)
  }
}

const getBodyPreview = (body: string): string => {
  const preview = redactToken(body).replace(/\s+/g, ' ').trim()
  return preview.length > ERROR_BODY_PREVIEW_LENGTH ? `${preview.slice(0, ERROR_BODY_PREVIEW_LENGTH)}...` : preview
}

const getErrorBodyMessage = (body: string): string => {
  if (!body) return 'Empty response body'

  try {
    const parsed = JSON.parse(body) as { error?: unknown; message?: unknown }
    if (typeof parsed.error === 'string') return parsed.error
    if (typeof parsed.message === 'string') return parsed.message
    return getBodyPreview(JSON.stringify(parsed))
  } catch {
    return getBodyPreview(body)
  }
}

const parseJsonResponse = <T>(body: string, res: Response, input: RequestInfo | URL): T => {
  if (!body) return undefined as T

  try {
    return JSON.parse(body) as T
  } catch {
    const contentType = res.headers.get('content-type') || 'unknown content type'
    throw new Error(
      `Expected JSON response from ${getRedactedRequestUrl(input)} but received ${contentType} (${res.status}): ${getBodyPreview(
        body,
      )}`,
    )
  }
}

export async function fetchWithErrorHandler<T>(input: RequestInfo | URL, options?: FetchOptions, retries = 3): Promise<T> {
  let lastError: any

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, options)
      const body = await res.text()

      if (res.status === 500) {
        throw new Error(`Fetch failed (${res.status}) for ${getRedactedRequestUrl(input)}: ${getErrorBodyMessage(body)}`)
      }

      if (!res.ok) {
        throw new Error(`Fetch failed (${res.status}) for ${getRedactedRequestUrl(input)}: ${getErrorBodyMessage(body)}`)
      }

      return parseJsonResponse<T>(body, res, input)
    } catch (error) {
      lastError = error
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
      }
    }
  }
  throw lastError
}
