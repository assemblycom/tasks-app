import { apiUrl } from '@/config'
import { headers } from 'next/headers'

type HeaderReader = {
  get(name: string): string | null
}

const getFirstHeaderValue = (value: string | null): string | null => value?.split(',')[0]?.trim() || null

export function getOriginFromHeaderReader(headerReader: HeaderReader, fallbackOrigin: string = apiUrl): string {
  const host = getFirstHeaderValue(headerReader.get('x-forwarded-host')) ?? getFirstHeaderValue(headerReader.get('host'))
  if (!host) return fallbackOrigin

  const protocol =
    getFirstHeaderValue(headerReader.get('x-forwarded-proto')) ??
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')

  return `${protocol}://${host}`
}

export async function getRequestOrigin(): Promise<string> {
  return getOriginFromHeaderReader(await headers())
}

export async function getInternalApiUrl(path: string): Promise<string> {
  return `${await getRequestOrigin()}${path}`
}

const readResponseBody = async (response: Response): Promise<string> => {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

const formatBodySnippet = (body: string): string => {
  const trimmed = body.trim()
  return trimmed ? trimmed.slice(0, 500) : 'Empty response body'
}

export async function assertOkResponse(response: Response, context: string): Promise<void> {
  if (response.ok) return

  const body = await readResponseBody(response)
  throw new Error(`${context} failed (${response.status} ${response.statusText}): ${formatBodySnippet(body)}`)
}

export async function parseJsonResponse<T>(response: Response, context: string): Promise<T> {
  const body = await readResponseBody(response)

  if (!response.ok) {
    throw new Error(`${context} failed (${response.status} ${response.statusText}): ${formatBodySnippet(body)}`)
  }

  if (!body.trim()) {
    throw new Error(`${context} returned an empty response body (${response.status} ${response.statusText})`)
  }

  try {
    return JSON.parse(body) as T
  } catch {
    throw new Error(
      `${context} returned a non-JSON response (${response.status} ${response.statusText}): ${formatBodySnippet(body)}`,
    )
  }
}
