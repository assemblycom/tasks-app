import { StatusableError } from '@/types/CopilotApiError'

export const RETRY_404_ENABLED = process.env.RETRY_404 === 'true'

const RETRYABLE_NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
])

type RetryableError = StatusableError & {
  code?: string
  cause?: unknown
}

const isRetryableNetworkError = (error: unknown, depth = 0): boolean => {
  if (!error || typeof error !== 'object' || depth > 3) return false

  const err = error as Partial<RetryableError>
  if (err.code && RETRYABLE_NETWORK_ERROR_CODES.has(err.code)) return true

  if (error instanceof TypeError && error.message === 'terminated') return true

  return isRetryableNetworkError(err.cause, depth + 1)
}

export const isRetryableCopilotError = (error: unknown): boolean => {
  const err = error && typeof error === 'object' ? (error as Partial<RetryableError>) : {}
  if (typeof err.status === 'number') {
    return (
      [408, 429].includes(err.status) ||
      (err.status >= 500 && err.status <= 511) ||
      (RETRY_404_ENABLED && err.status === 404)
    )
  }

  return isRetryableNetworkError(error)
}
