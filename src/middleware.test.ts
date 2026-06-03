import { NextRequest } from 'next/server'
import { middleware } from './middleware'

const ORIGINAL_ENV = process.env

const buildRequest = (cookie?: string) =>
  new NextRequest('https://tasks-app-sand.vercel.app/detail/task-id/iu', {
    headers: cookie ? { cookie } : undefined,
  })

describe('middleware', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    delete process.env.VERCEL_SKEW_PROTECTION_ENABLED
    delete process.env.VERCEL_DEPLOYMENT_ID
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('sets the Vercel deployment pin cookie when skew protection is enabled', () => {
    process.env.VERCEL_SKEW_PROTECTION_ENABLED = '1'
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_test123'

    const response = middleware(buildRequest())

    expect(response.cookies.get('__vdpl')).toMatchObject({
      name: '__vdpl',
      value: 'dpl_test123',
    })
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(response.headers.get('set-cookie')).toContain('SameSite=strict')
  })

  it('does not set a deployment pin when skew protection is disabled', () => {
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_test123'

    const response = middleware(buildRequest())

    expect(response.cookies.get('__vdpl')).toBeUndefined()
  })

  it('preserves an existing deployment pin', () => {
    process.env.VERCEL_SKEW_PROTECTION_ENABLED = '1'
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_new'

    const response = middleware(buildRequest('__vdpl=dpl_existing'))

    expect(response.cookies.get('__vdpl')).toBeUndefined()
  })
})
