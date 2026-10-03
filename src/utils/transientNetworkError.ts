const TRANSIENT_NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
])

const TLS_DISCONNECT_MESSAGE = 'Client network socket disconnected before secure TLS connection was established'

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return ''
}

const getErrorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== 'object') return undefined

  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

const getErrorCause = (error: unknown): unknown => {
  if (!error || typeof error !== 'object') return undefined

  return (error as { cause?: unknown }).cause
}

export const isTransientNetworkError = (error: unknown, depth = 0): boolean => {
  if (!error || depth > 4) return false

  if (typeof error === 'string' && /fetch failed|failed to fetch/i.test(error)) {
    return true
  }

  if (error instanceof TypeError) {
    const message = error.message
    if (message === 'fetch failed' || message === 'terminated' || message === 'Failed to fetch') {
      return true
    }
  }

  const code = getErrorCode(error)
  if (code && TRANSIENT_NETWORK_ERROR_CODES.has(code)) return true

  const message = getErrorMessage(error)
  if (message.includes(TLS_DISCONNECT_MESSAGE)) return true

  const cause = getErrorCause(error)
  if (!cause) return false

  return isTransientNetworkError(cause, depth + 1)
}

export const eventHasTransientNetworkException = (event: {
  exception?: { values?: Array<{ type?: string; value?: string }> }
  message?: string
}): boolean => {
  const values = event.exception?.values ?? []
  for (const entry of values) {
    const synthetic = entry.value ? `${entry.type ?? ''}: ${entry.value}` : entry.type
    if (isTransientNetworkError(synthetic) || isTransientNetworkError(entry.value)) {
      return true
    }
  }

  if (event.message && isTransientNetworkError(event.message)) {
    return true
  }

  return false
}
