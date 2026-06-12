import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import { config, proxy } from './proxy'

const detailUrl = 'https://example.com/detail/9474a765-95dc-445f-aaca-7f950acdbdce/iu?token=test-token'

describe('proxy', () => {
  it('only matches detail page routes', () => {
    expect(unstable_doesMiddlewareMatch({ config, url: detailUrl })).toBe(true)
    expect(unstable_doesMiddlewareMatch({ config, url: 'https://example.com/api/tasks' })).toBe(false)
  })

  it('short-circuits HEAD detail page requests', () => {
    const response = proxy(new NextRequest(detailUrl, { method: 'HEAD' }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-middleware-next')).toBeNull()
  })

  it('continues normal detail page navigation', () => {
    const response = proxy(new NextRequest(detailUrl, { method: 'GET' }))

    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})
