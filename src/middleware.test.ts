import { NextRequest } from 'next/server'
import { isDetailPageHeadRequest, middleware } from './middleware'

const buildRequest = (url: string, method = 'GET') => new NextRequest(new Request(url, { method }))

describe('middleware', () => {
  it('short-circuits HEAD requests to task detail pages', () => {
    const request = buildRequest('https://example.com/detail/9474a765-95dc-445f-aaca-7f950acdbdce/iu?token=token', 'HEAD')

    expect(isDetailPageHeadRequest(request)).toBe(true)

    const response = middleware(request)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('allows GET requests to task detail pages to continue to the app route', () => {
    const request = buildRequest('https://example.com/detail/9474a765-95dc-445f-aaca-7f950acdbdce/iu?token=token')

    expect(isDetailPageHeadRequest(request)).toBe(false)

    const response = middleware(request)
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('does not short-circuit HEAD requests to unrelated pages', () => {
    const request = buildRequest('https://example.com/configure-tasks-app', 'HEAD')

    expect(isDetailPageHeadRequest(request)).toBe(false)
  })
})
