import { isIgnoredBrowserSentryError } from './sentryIgnoredErrors'

describe('isIgnoredBrowserSentryError', () => {
  it('ignores browser history pushState instrumentation noise', () => {
    expect(isIgnoredBrowserSentryError('Error: NS Pushstate prevention')).toBe(true)
    expect(isIgnoredBrowserSentryError('ns pushstate prevention')).toBe(true)
  })

  it('ignores cross-origin history replaceState security errors', () => {
    expect(
      isIgnoredBrowserSentryError(
        'SecurityError: Blocked attempt to use history.replaceState() to change session history URL from https://help.kudzu.digital/login?step=signIn to https://auth.copilot.app/auth/google/callback.',
      ),
    ).toBe(true)
    expect(
      isIgnoredBrowserSentryError(
        'SecurityError: Blocked attempt to use history.pushState() to change session history URL from https://portal.example.com/login to https://auth.copilot.app/auth/google/callback.',
      ),
    ).toBe(true)
  })

  it('keeps ignoring generic browser fetch failures', () => {
    expect(isIgnoredBrowserSentryError('TypeError: Failed to fetch')).toBe(true)
    expect(isIgnoredBrowserSentryError('Error: fetch failed')).toBe(true)
  })

  it('does not ignore unrelated application errors', () => {
    expect(isIgnoredBrowserSentryError('Error: Unable to create task')).toBe(false)
  })
})
