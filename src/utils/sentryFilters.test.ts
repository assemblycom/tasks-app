import { shouldDropFetchFailureEvent } from '@/utils/sentryFilters'

describe('shouldDropFetchFailureEvent', () => {
  it('drops fetch failures from exception values', () => {
    expect(
      shouldDropFetchFailureEvent({
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Fetch failed (403): {"error":"Something went wrong"}',
            },
          ],
        },
      }),
    ).toBe(true)
  })

  it('drops failed-to-fetch messages', () => {
    expect(
      shouldDropFetchFailureEvent({
        message: 'TypeError: Failed to fetch',
      }),
    ).toBe(true)
  })

  it('keeps unrelated errors', () => {
    expect(
      shouldDropFetchFailureEvent({
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Unexpected task serialization failure',
            },
          ],
        },
      }),
    ).toBe(false)
  })
})
