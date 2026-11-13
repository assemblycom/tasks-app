import { isNilUuid, isUuid, NIL_UUID } from '@/utils/uuid'

describe('uuid utils', () => {
  it('detects nil UUID', () => {
    expect(isNilUuid(NIL_UUID)).toBe(true)
    expect(isNilUuid('00000000-0000-0000-0000-000000000001')).toBe(false)
  })

  it('validates RFC4122 UUIDs', () => {
    expect(isUuid('9e045b7a-7575-4fbda1e9-62587449f3f0')).toBe(false)
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isUuid('9e045b7a7575fbda1e96258749f3f098286ba2ab8d31d9f02261e1cb5e4a017ce')).toBe(false)
  })
})
