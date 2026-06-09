import { NextRequest } from 'next/server'
import { proxy } from './proxy'

const createRequest = (method: string, pathname: string) =>
  new NextRequest(`https://tasks.assembly.com${pathname}`, { method })

describe('proxy', () => {
  it('short-circuits task detail HEAD requests without rendering the page', async () => {
    const response = proxy(createRequest('HEAD', '/detail/9474a765-95dc-445f-aaca-7f950acdbdce/iu?token=test-token'))

    expect(response?.status).toBe(200)
    expect(response?.headers.get('Cache-Control')).toBe('no-store')
    expect(await response?.text()).toBe('')
  })

  it('allows task detail GET requests to continue to the page', () => {
    expect(proxy(createRequest('GET', '/detail/9474a765-95dc-445f-aaca-7f950acdbdce/iu?token=test-token'))).toBeUndefined()
  })

  it('allows non-detail HEAD requests to continue', () => {
    expect(proxy(createRequest('HEAD', '/api/tasks?token=test-token'))).toBeUndefined()
  })
})
