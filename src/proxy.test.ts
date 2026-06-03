import { proxy } from './proxy'

const buildRequest = (method: string) => ({ method }) as Parameters<typeof proxy>[0]

describe('proxy', () => {
  it('short-circuits HEAD detail requests without caching', () => {
    const response = proxy(buildRequest('HEAD'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('continues non-HEAD detail requests to the route handler', () => {
    const response = proxy(buildRequest('GET'))

    expect(response.headers.get('x-middleware-next')).toBe('1')
  })
})
