import { NIL_UUID, isNilUuid } from '@/utils/uuid'

describe('uuid utils', () => {
  it('identifies the nil UUID', () => {
    expect(isNilUuid(NIL_UUID)).toBe(true)
  })

  it('rejects real and empty ids', () => {
    expect(isNilUuid('591aaab2-f128-419e-8f40-65fb83e71a5e')).toBe(false)
    expect(isNilUuid('')).toBe(false)
    expect(isNilUuid(null)).toBe(false)
    expect(isNilUuid(undefined)).toBe(false)
  })
})
