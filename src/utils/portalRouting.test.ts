import { shouldRedirectToClientPortal } from './portalRouting'

describe('shouldRedirectToClientPortal', () => {
  it('redirects company-scoped tokens to the client portal', () => {
    expect(shouldRedirectToClientPortal({ companyId: '2e8c39e9-eb18-4d57-af7e-25bf967e1935' })).toBe(true)
  })

  it('keeps internal-only tokens on the internal home board', () => {
    expect(shouldRedirectToClientPortal({})).toBe(false)
  })
})
