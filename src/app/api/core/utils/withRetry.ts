import { StatusableError } from '@/types/CopilotApiError'
import pRetry, { FailedAttemptError } from 'p-retry'
import * as Sentry from '@sentry/nextjs'

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
      shouldRetry: (error: any) => {
        // Retry Copilot status errors as well as transient network failures from undici/fetch.
        return isRetryableCopilotError(error)
      },
    },
  )
}
