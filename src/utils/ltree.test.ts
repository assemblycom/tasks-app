import { buildLtree, getIdsFromLtreePath } from './ltree'

describe('ltree utilities', () => {
  it('converts UUIDs to ltree paths and back', () => {
    const path = buildLtree('66b59e0d-7657-4be0-8dd1-26d1a3884a51', '9ee6e582-e1cb-44a1-b9bc-95d909b08079')

    expect(path).toBe('66b59e0d_7657_4be0_8dd1_26d1a3884a51.9ee6e582_e1cb_44a1_b9bc_95d909b08079')
    expect(getIdsFromLtreePath(path)).toEqual([
      '66b59e0d-7657-4be0-8dd1-26d1a3884a51',
      '9ee6e582-e1cb-44a1-b9bc-95d909b08079',
    ])
  })

  it('returns an empty path for missing legacy ltree values', () => {
    expect(getIdsFromLtreePath(null)).toEqual([])
    expect(getIdsFromLtreePath(undefined)).toEqual([])
  })
})
