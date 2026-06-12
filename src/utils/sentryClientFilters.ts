import type { Event } from '@sentry/nextjs'

const METAMASK_INPAGE_SCRIPT_PATTERN = /(?:^|\/)scripts\/inpage\.js(?:$|\?)/
const METAMASK_NOISE_PATTERNS = [
  /failed to connect to metamask/i,
  /metamask extension not found/i,
]

const isMetaMaskNoiseMessage = (message?: string) =>
  typeof message === 'string' &&
  METAMASK_NOISE_PATTERNS.some((pattern) => pattern.test(message))

const isMetaMaskInjectedFrame = (frame: {
  filename?: string
  abs_path?: string
}) =>
  [frame.filename, frame.abs_path].some(
    (path) =>
      typeof path === 'string' && METAMASK_INPAGE_SCRIPT_PATTERN.test(path),
  )

export const shouldDropClientSentryEvent = (event: Event) => {
  const exceptions = event.exception?.values ?? []
  const hasMetaMaskMessage = exceptions.some((exception) =>
    [exception.type, exception.value].some(isMetaMaskNoiseMessage),
  )

  if (!hasMetaMaskMessage) {
    return false
  }

  return exceptions.some((exception) =>
    exception.stacktrace?.frames?.some(isMetaMaskInjectedFrame),
  )
}
