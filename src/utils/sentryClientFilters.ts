import type { Event } from '@sentry/nextjs'

const INJECTED_SCRIPT_PATTERNS = ['inpage.js', 'injected.js']

const getExceptionFrames = (event: Event) =>
  event.exception?.values?.flatMap((value) => value.stacktrace?.frames ?? []) ??
  []

const framePath = (frame: { filename?: string; abs_path?: string }) =>
  [frame.filename, frame.abs_path].find((path) => typeof path === 'string') ??
  ''

const isInjectedExtensionError = (event: Event) => {
  const frames = getExceptionFrames(event)
  return frames.some((frame) =>
    INJECTED_SCRIPT_PATTERNS.some((pattern) =>
      framePath(frame).includes(pattern),
    ),
  )
}

const isBlobOriginExtensionError = (event: Event) => {
  const frames = getExceptionFrames(event)
  return Boolean(
    frames.length &&
      frames.every((frame) => framePath(frame).startsWith('blob:')),
  )
}

export const shouldDropClientSentryEvent = (event: Event) =>
  isInjectedExtensionError(event) || isBlobOriginExtensionError(event)
