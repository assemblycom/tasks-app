import type { NextRequest } from 'next/server'
import { config, proxy } from './proxy'

const requestWithMethod = (method: string) => ({ method }) as NextRequest

describe('proxy', () => {
  it('answers HEAD requests without continuing to page rendering', async () => {
    const response = proxy(requestWithMethod('HEAD'))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
    expect(response.headers.get('x-middleware-next')).toBeNull()
  })

  it('continues non-HEAD requests to the matched route', () => {
    const response = proxy(requestWithMethod('GET'))

    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('only runs on detail routes', () => {
    expect(config.matcher).toBe('/detail/:path*')
  })
})
