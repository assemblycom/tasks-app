import { StatusableError } from '@/types/CopilotApiError'
import pRetry, { FailedAttemptError } from 'p-retry'
import * as Sentry from '@sentry/nextjs'

export const RETRY_404_ENABLED = process.env.RETRY_404 === 'true'

const TRANSIENT_NETWORK_ERROR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'])
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

const isRetryableStatusError = (error: unknown): boolean => {
  const status = (error as Partial<StatusableError>)?.status
  if (typeof status !== 'number') return false

  return [408, 429].includes(status) || (status >= 500 && status <= 511) || (RETRY_404_ENABLED && status === 404)
}

export const isTransientNetworkError = (error: unknown): boolean => {
  const code = getErrorCode(error)
  if (code && TRANSIENT_NETWORK_ERROR_CODES.has(code)) return true

  const message = getErrorMessage(error)
  if (message.includes(TLS_DISCONNECT_MESSAGE)) return true

  const cause = getErrorCause(error)
  if (!cause) return false

  return isTransientNetworkError(cause)
}

export const withRetry = async <T>(fn: (...args: any[]) => Promise<T>, args: any[]): Promise<T> => {
  let isEventProcessorRegistered = false

  return await pRetry(
    async () => {
      try {
        return await fn(...args)
      } catch (error) {
        // Hopefully now sentry doesn't report retry errors as well. We have enough triage issues as it is
        Sentry.withScope((scope) => {
          if (isEventProcessorRegistered) return

          isEventProcessorRegistered = true
          scope.addEventProcessor((event) => {
            if (event.level === 'error' && event.message && event.message.includes('An error occurred during retry')) {
              return null // Discard the event as it occured during retry
            }
            return event
          })
        })
        // Rethrow the error so pRetry can rety
        throw error
      }
    },

    {
      retries: 3,
      minTimeout: 500,
      maxTimeout: 5000,
      factor: 2, // Exponential factor for timeout delay. Tweak this if issues still persist
      onFailedAttempt: (error: FailedAttemptError) => {
        console.warn(
          `CopilotAPI#withRetry | Attempt ${error.attemptNumber} failed. There are ${error.retriesLeft} retries left`,
        )
      },
      shouldRetry: (error: unknown) => {
        return isRetryableStatusError(error) || isTransientNetworkError(error)
      },
    },
  )
}
