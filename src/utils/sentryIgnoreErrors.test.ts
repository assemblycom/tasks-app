import { clientIgnoredErrors } from './sentryIgnoreErrors'

const isIgnoredClientError = (message: string) => clientIgnoredErrors.some((pattern) => pattern.test(message))

describe('clientIgnoredErrors', () => {
  it.each(['fetch failed', 'Failed to fetch', 'Load failed', 'TypeError: network error', 'network error'])(
    'ignores browser network failure noise: %s',
    (message) => {
      expect(isIgnoredClientError(message)).toBe(true)
    },
  )

  it.each(['Network error while saving task', 'Unable to authorize Copilot SDK', 'TypeError: Cannot read properties of undefined'])(
    'does not ignore actionable client errors: %s',
    (message) => {
      expect(isIgnoredClientError(message)).toBe(false)
    },
  )
})
