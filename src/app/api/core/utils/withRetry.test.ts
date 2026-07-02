import { isTransientNetworkError, withRetry } from './withRetry'

jest.mock('@sentry/nextjs', () => ({
  withScope: jest.fn((callback: (scope: { addEventProcessor: jest.Mock }) => void) => {
    callback({ addEventProcessor: jest.fn() })
  }),
}))

const createTlsDisconnectError = () =>
  Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error('Client network socket disconnected before secure TLS connection was established'), {
      code: 'ECONNRESET',
    }),
  })

describe('isTransientNetworkError', () => {
  it('detects TLS disconnect errors nested under fetch failures', () => {
    expect(isTransientNetworkError(createTlsDisconnectError())).toBe(true)
  })

  it('does not classify unrelated errors as transient network errors', () => {
    expect(isTransientNetworkError(new Error('validation failed'))).toBe(false)
  })
})

describe('withRetry', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('retries transient network errors that do not have an HTTP status', async () => {
    const fn = jest.fn().mockRejectedValueOnce(createTlsDisconnectError()).mockResolvedValueOnce('ok')

    await expect(withRetry(fn, [])).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not retry errors without retryable status or transient network causes', async () => {
    const error = new Error('validation failed')
    const fn = jest.fn().mockRejectedValue(error)

    await expect(withRetry(fn, [])).rejects.toBe(error)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
