import { isIgnoredBrowserSentryError } from './sentryIgnoredErrors'

describe('isIgnoredBrowserSentryError', () => {
  it('ignores browser history pushState instrumentation noise', () => {
    expect(isIgnoredBrowserSentryError('Error: NS Pushstate prevention')).toBe(true)
    expect(isIgnoredBrowserSentryError('ns pushstate prevention')).toBe(true)
  })

  it('keeps ignoring generic browser fetch failures', () => {
    expect(isIgnoredBrowserSentryError('TypeError: Failed to fetch')).toBe(true)
    expect(isIgnoredBrowserSentryError('Error: fetch failed')).toBe(true)
  })

  it('does not ignore unrelated application errors', () => {
    expect(isIgnoredBrowserSentryError('Error: Unable to create task')).toBe(false)
  })
})
