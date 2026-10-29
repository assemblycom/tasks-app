import { parsePortalAppLink } from './portalLinks'

const origins = ['https://acme.myassembly.com', 'https://dashboard.assembly.com']

describe('parsePortalAppLink', () => {
  it('recognises the canonical app URL on the client portal', () => {
    expect(parsePortalAppLink('https://acme.myassembly.com/apps/inst-1', origins)).toEqual({ installId: 'inst-1' })
    expect(parsePortalAppLink('https://acme.myassembly.com/apps/inst-1/', origins)).toEqual({ installId: 'inst-1' })
  })

  it('keeps an inner path so the link lands on a specific page of the app', () => {
    expect(parsePortalAppLink('https://acme.myassembly.com/apps/inst-1/orders/42', origins)).toEqual({
      installId: 'inst-1',
      path: '/orders/42',
    })
  })

  it('accepts the dashboard form with a workspace prefix', () => {
    expect(parsePortalAppLink('https://dashboard.assembly.com/w/acme/apps/inst-1/orders/42', origins)).toEqual({
      installId: 'inst-1',
      path: '/orders/42',
    })
  })

  it('accepts the older ?id= form', () => {
    expect(parsePortalAppLink('https://acme.myassembly.com/apps?id=inst-1', origins)).toEqual({ installId: 'inst-1' })
    expect(parsePortalAppLink('https://dashboard.assembly.com/w/acme/apps?id=inst-1', origins)).toEqual({
      installId: 'inst-1',
    })
  })

  it('ignores links that are not portal app links', () => {
    expect(parsePortalAppLink('https://example.com/apps/inst-1', origins)).toBeNull()
    expect(parsePortalAppLink('https://acme.myassembly.com/files', origins)).toBeNull()
    expect(parsePortalAppLink('https://acme.myassembly.com/apps', origins)).toBeNull()
    expect(parsePortalAppLink('https://acme.myassembly.com/apps?id=../etc', origins)).toBeNull()
    expect(parsePortalAppLink('mailto:someone@example.com', origins)).toBeNull()
    expect(parsePortalAppLink('not a url', origins)).toBeNull()
  })
})
