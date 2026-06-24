type SentryExceptionValue = {
  type?: string
  value?: string
}

type SentryEventLike = {
  message?: string
  exception?: {
    values?: SentryExceptionValue[]
  }
}

export const FETCH_FAILURE_ERROR_PATTERNS = [/fetch failed/i, /failed to fetch/i]

export function shouldDropFetchFailureEvent(event: SentryEventLike): boolean {
  const candidates = [
    event.message,
    ...(event.exception?.values ?? []).flatMap((exception) => [exception.type, exception.value]),
  ].filter((candidate): candidate is string => typeof candidate === 'string')

  return candidates.some((candidate) => FETCH_FAILURE_ERROR_PATTERNS.some((pattern) => pattern.test(candidate)))
}
