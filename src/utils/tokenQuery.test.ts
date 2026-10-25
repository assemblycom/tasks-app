import { buildTokenQueryString, normalizeTokenParam } from '@/utils/tokenQuery'

describe('normalizeTokenParam', () => {
  it('returns null for empty values', () => {
    expect(normalizeTokenParam(undefined)).toBeNull()
    expect(normalizeTokenParam('   ')).toBeNull()
  })

  it('unwraps nested token query strings', () => {
    expect(normalizeTokenParam('token=abc123')).toBe('abc123')
    expect(normalizeTokenParam('?token=abc123')).toBe('abc123')
  })

  it('strips duplicated ?token= suffixes from malformed links', () => {
    expect(normalizeTokenParam('abc123?token=ignored')).toBe('abc123')
  })
})

describe('buildTokenQueryString', () => {
  it('encodes token and extra params', () => {
    expect(buildTokenQueryString('tok', { isRedirect: '1' })).toBe('token=tok&isRedirect=1')
  })
})
