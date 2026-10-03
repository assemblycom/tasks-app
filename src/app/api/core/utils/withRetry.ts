import { StatusableError } from '@/types/CopilotApiError'
import { isTransientNetworkError } from '@/utils/transientNetworkError'
import pRetry, { FailedAttemptError } from 'p-retry'
import * as Sentry from '@sentry/nextjs'

export const RETRY_404_ENABLED = process.env.RETRY_404 === 'true'

export const getHttpStatusFromError = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined

  const status = (error as Partial<StatusableError>).status
  if (typeof status === 'number') return status

  const responseStatus = (error as { response?: { status?: unknown } }).response?.status
  if (typeof responseStatus === 'number') return responseStatus

  return undefined
}

const isRetryableStatusError = (error: unknown): boolean => {
  const status = getHttpStatusFromError(error)
  if (typeof status !== 'number') return false

  return [408, 429].includes(status) || (status >= 500 && status <= 511) || (RETRY_404_ENABLED && status === 404)
}

export const withRetry = async <T>(fn: (...args: any[]) => Promise<T>, args: any[]): Promise<T> => {
  let isEventProcessorRegistered = false

  return await pRetry(
    async () => {
      try {
        return await fn(...args)
      } catch (error) {
        Sentry.withScope((scope) => {
          if (isEventProcessorRegistered) return

          isEventProcessorRegistered = true
          scope.addEventProcessor((event) => {
            if (event.level === 'error' && event.message && event.message.includes('An error occurred during retry')) {
              return null
            }
            return event
          })
        })
        throw error
      }
    },

    {
      retries: 3,
      minTimeout: 500,
      maxTimeout: 5000,
      factor: 2,
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
