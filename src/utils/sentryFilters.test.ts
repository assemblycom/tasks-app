import { shouldDropUnrecognizedServerActionSentryEvent } from '@/utils/sentryFilters'

describe('shouldDropUnrecognizedServerActionSentryEvent', () => {
  it('drops Next.js unrecognized server action errors', () => {
    expect(
      shouldDropUnrecognizedServerActionSentryEvent({
        exception: {
          values: [
            {
              type: 'UnrecognizedActionError',
              value:
                'UnrecognizedActionError: Server Action "40dd49803558b73c8f6fb2a5d37b85252e99fc8502" was not found on the server.',
            },
          ],
        },
      }),
    ).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(shouldDropUnrecognizedServerActionSentryEvent({ message: 'Something else failed' })).toBe(false)
  })
})
