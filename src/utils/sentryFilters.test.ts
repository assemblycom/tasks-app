import { shouldDropCopilotMissingClientSentryEvent } from '@/utils/sentryFilters'

describe('sentryFilters', () => {
  it('drops Assembly missing-client noise', () => {
    expect(
      shouldDropCopilotMissingClientSentryEvent({
        exception: { values: [{ value: "Error: No client found with 'abc'" }] },
      }),
    ).toBe(true)
  })

  it('keeps unrelated errors', () => {
    expect(
      shouldDropCopilotMissingClientSentryEvent({
        exception: { values: [{ value: 'TypeError: Cannot read property' }] },
      }),
    ).toBe(false)
  })
})
