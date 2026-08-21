import { isInvalidPaginationCursorError } from '@/utils/copilotError'

describe('isInvalidPaginationCursorError', () => {
  it('matches DynamoDB invalid starting key errors', () => {
    expect(
      isInvalidPaginationCursorError(
        new Error('Failed to list clients: ValidationException: The provided starting key is invalid'),
      ),
    ).toBe(true)
  })

  it('does not match unrelated errors', () => {
    expect(isInvalidPaginationCursorError(new Error('Unauthorized'))).toBe(false)
  })
})
