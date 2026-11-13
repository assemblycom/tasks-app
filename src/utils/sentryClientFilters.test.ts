import type { Event } from '@sentry/nextjs'

import { shouldDropClientSentryEvent } from './sentryClientFilters'

type SentryException = NonNullable<
  NonNullable<Event['exception']>['values']
>[number]

const eventWithException = (exception: SentryException): Event => ({
  exception: {
    values: [exception],
  },
})

describe('shouldDropClientSentryEvent', () => {
  it('drops extension errors from inpage.js (e.g. dispatchEvent / emit noise)', () => {
    const event = eventWithException({
      type: 'TypeError',
      value: "Cannot read properties of undefined (reading 'dispatchEvent')",
      stacktrace: {
        frames: [
          {
            filename: 'app:///scripts/inpage.js',
            function: 'Object.connect',
          },
        ],
      },
    })

    expect(shouldDropClientSentryEvent(event)).toBe(true)
  })

  it('drops extension errors from injected.js', () => {
    const event = eventWithException({
      type: 'TypeError',
      value: "'set' on proxy: trap returned falsish for property 'tronlinkParams'",
      stacktrace: {
        frames: [
          {
            abs_path: 'chrome-extension://id/scripts/injected.js',
          },
        ],
      },
    })

    expect(shouldDropClientSentryEvent(event)).toBe(true)
  })

  it('drops obfuscated extension errors with an all-blob stack', () => {
    const event = eventWithException({
      type: 'TypeError',
      value: '_0x525794.PrSAI is not a function',
      stacktrace: {
        frames: [
          { filename: 'blob:https://tasks.example/abc-123' },
          { filename: 'blob:https://tasks.example/def-456' },
        ],
      },
    })

    expect(shouldDropClientSentryEvent(event)).toBe(true)
  })

  it('keeps first-party app errors', () => {
    const event = eventWithException({
      type: 'TypeError',
      value: "Cannot read properties of undefined (reading 'id')",
      stacktrace: {
        frames: [
          {
            filename: 'app:///static/chunks/app/page.js',
          },
        ],
      },
    })

    expect(shouldDropClientSentryEvent(event)).toBe(false)
  })
})
