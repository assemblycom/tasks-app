import { isRetryableCopilotError } from '@api/core/utils/retryableError'
import pRetry, { FailedAttemptError } from 'p-retry'
import * as Sentry from '@sentry/nextjs'

export const RETRY_404_ENABLED = process.env.RETRY_404 === 'true'

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
