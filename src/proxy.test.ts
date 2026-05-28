import { proxy } from './proxy'
import type { NextRequest } from 'next/server'

const requestWithMethod = (method: string) => ({ method }) as NextRequest

describe('proxy', () => {
  it('short-circuits HEAD requests', () => {
    const response = proxy(requestWithMethod('HEAD'))

    expect(response.status).toBe(200)
    expect(response.body).toBeNull()
  })

  it('continues non-HEAD requests', () => {
    const response = proxy(requestWithMethod('GET'))

    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})
