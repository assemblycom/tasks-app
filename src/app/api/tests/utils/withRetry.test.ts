import { isRetryableCopilotError } from '@api/core/utils/withRetry'

describe('withRetry util', () => {
  it.each([408, 429, 500, 503, 511])('retries retryable status code %s', (status) => {
    expect(isRetryableCopilotError({ status })).toBe(true)
  })

  it.each([400, 401, 404, 422])('does not retry non-retryable status code %s', (status) => {
    expect(isRetryableCopilotError({ status })).toBe(false)
  })

  it.each(['ECONNRESET', 'ETIMEDOUT', 'UND_ERR_SOCKET'])('retries transient network code %s', (code) => {
    expect(isRetryableCopilotError({ code })).toBe(true)
  })

  it('retries undici terminated errors', () => {
    expect(isRetryableCopilotError(new TypeError('terminated'))).toBe(true)
  })

  it('retries transient network errors nested as causes', () => {
    expect(isRetryableCopilotError(new TypeError('terminated', { cause: { code: 'ECONNRESET' } }))).toBe(true)
  })
})
