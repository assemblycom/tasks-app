import { sentryIgnoreErrors } from './sentryIgnoreErrors'

const isIgnored = (message: string) => sentryIgnoreErrors.some((pattern) => pattern.test(message))

describe('sentryIgnoreErrors', () => {
  it.each([
    'retryable error: max retries exceeded',
    'Unable to send replay - max retries exceeded',
    'TypeError: fetch failed',
  ])('ignores known retry and network noise: %s', (message) => {
    expect(isIgnored(message)).toBe(true)
  })

  it('does not ignore application errors', () => {
    expect(isIgnored('Failed to perform a Copilot API call: {"code":"api_error"}')).toBe(false)
  })
})
