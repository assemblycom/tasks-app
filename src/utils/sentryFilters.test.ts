import { shouldDropRequestBodySizeLimitSentryEvent } from '@/utils/sentryFilters'

describe('shouldDropRequestBodySizeLimitSentryEvent', () => {
  it('drops Next.js server action body limit errors', () => {
    expect(
      shouldDropRequestBodySizeLimitSentryEvent({
        exception: { values: [{ value: 'Error: Body exceeded 1 MB limit.' }] },
      }),
    ).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(shouldDropRequestBodySizeLimitSentryEvent({ message: 'Something else failed' })).toBe(false)
  })
})
