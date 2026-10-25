import { buildTokenQueryString, normalizeTokenParam } from '@/utils/tokenQuery'

describe('tokenQuery utils', () => {
  describe('normalizeTokenParam', () => {
    it('returns a valid token unchanged', () => {
      expect(normalizeTokenParam('abc123')).toBe('abc123')
    })

    it('extracts a token from a nested token query value', () => {
      expect(normalizeTokenParam('token=abc123')).toBe('abc123')
      expect(normalizeTokenParam('?token=abc123')).toBe('abc123')
    })

    it('removes a duplicated token suffix from malformed internal links', () => {
      expect(normalizeTokenParam('abc123?token=undefined')).toBe('abc123')
    })

    it('returns null for missing or empty tokens', () => {
      expect(normalizeTokenParam(undefined)).toBeNull()
      expect(normalizeTokenParam(null)).toBeNull()
      expect(normalizeTokenParam('   ')).toBeNull()
      expect(normalizeTokenParam('token=')).toBeNull()
    })
  })

  it('builds an encoded token query string with extra params', () => {
    expect(buildTokenQueryString('token=abc123', { isRedirect: '1' })).toBe('token=token%3Dabc123&isRedirect=1')
  })
})
