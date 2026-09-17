import { parseStrictBooleanQuery } from '@/utils/request'
import APIError from '@api/core/exceptions/api'
import httpStatus from 'http-status'

describe('parseStrictBooleanQuery', () => {
  it('returns the default when the value is absent', () => {
    expect(parseStrictBooleanQuery(null, { defaultValue: false })).toBe(false)
    expect(parseStrictBooleanQuery(null, { defaultValue: true })).toBe(true)
  })

  it.each(['1', 't', 'T', 'TRUE', 'true', 'True'])('parses %s as true', (value) => {
    expect(parseStrictBooleanQuery(value, { defaultValue: false })).toBe(true)
  })

  it.each(['0', 'f', 'F', 'FALSE', 'false', 'False'])('parses %s as false', (value) => {
    expect(parseStrictBooleanQuery(value, { defaultValue: true })).toBe(false)
  })

  it.each(['banana', '2', '', 'yes', 'no', 'TrUe'])('rejects invalid value %s with a 400', (value) => {
    expect(() => parseStrictBooleanQuery(value, { defaultValue: false })).toThrow(APIError)
    expect(() => parseStrictBooleanQuery(value, { defaultValue: false })).toThrow(
      expect.objectContaining({ status: httpStatus.BAD_REQUEST }),
    )
  })
})
