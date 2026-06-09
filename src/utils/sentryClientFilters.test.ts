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
  it('drops MetaMask connection failures from the injected inpage script', () => {
    const event = eventWithException({
      type: 'i',
      value: 'Failed to connect to MetaMask',
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

  it('drops linked MetaMask extension-not-found errors from the injected script', () => {
    const event = eventWithException({
      type: 'Error',
      value: 'MetaMask extension not found',
      stacktrace: {
        frames: [
          {
            abs_path: 'chrome-extension://id/scripts/inpage.js',
          },
        ],
      },
    })

    expect(shouldDropClientSentryEvent(event)).toBe(true)
  })

  it('keeps app-owned errors that mention MetaMask without the injected script frame', () => {
    const event = eventWithException({
      type: 'Error',
      value: 'Failed to connect to MetaMask',
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

  it('keeps unrelated injected-script errors', () => {
    const event = eventWithException({
      type: 'Error',
      value: 'ResizeObserver loop completed with undelivered notifications.',
      stacktrace: {
        frames: [
          {
            filename: 'app:///scripts/inpage.js',
          },
        ],
      },
    })

    expect(shouldDropClientSentryEvent(event)).toBe(false)
  })
})
