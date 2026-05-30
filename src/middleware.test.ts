import { NextRequest } from 'next/server'
import { middleware } from './middleware'

describe('middleware', () => {
  it('short-circuits HEAD requests to the home page', () => {
    const request = new NextRequest(new Request('https://example.com/?token=test-token', { method: 'HEAD' }))

    const response = middleware(request)

    expect(response.status).toBe(204)
    expect(response.body).toBeNull()
  })
})
