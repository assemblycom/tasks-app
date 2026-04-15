import authenticate from '@api/core/utils/authenticate'
import { buildNextRequest } from '@api/tests/__utils__/testUtils'
import httpStatus from 'http-status'
import { mockTokenPayloads } from '@/app/api/tests/__mocks__/mockData'
import { mockCopilotAPI } from '@api/tests/__mocks__/CopilotAPI.mock'
import APIError from '@api/core/exceptions/api'
import { NextRequest } from 'next/server'

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation((token: string) => mockCopilotAPI(token)),
}))

describe('authenticate util', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('authenticates a valid IU token', async () => {
    const req = buildNextRequest(`/?token=iu-token`)
    const user = await authenticate(req)
    expect(user.internalUserId).toBe(mockTokenPayloads.internalUser.internalUserId)
  })

  it('authenticates a valid client token', async () => {
    const req = buildNextRequest(`/?token=client-token`)
    const user = await authenticate(req)
    expect(user.clientId).toBe(mockTokenPayloads.client.clientId)
  })

  it('throws APIError if token is not provided', async () => {
    const req = buildNextRequest(`/?token=`)
    try {
      await authenticate(req)
      fail('Expected authenticate function to throw an error, but it did not')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(APIError)
      expect((error as APIError).status).toBe(httpStatus.UNAUTHORIZED)
      expect((error as Error).message).toBe('Please provide a valid token')
    }
  })

  it('throws CopilotApiError if token cannot be authenticated', async () => {
    const req = buildNextRequest(`/?token=invalid-token`)
    try {
      await authenticate(req)
      fail('Expected authenticate function to throw an error, but it did not')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(APIError)
      expect((error as Error).message).toBe('Failed to authenticate token')
    }
  })

  it('captures assembly metadata headers when present', async () => {
    const req = new NextRequest(
      new Request(process.env.VERCEL_URL + '/?token=iu-token', {
        headers: {
          'x-assembly-source': 'platform',
          'x-assembly-client-ip': '192.168.1.1',
          'x-assembly-user-agent': 'Mozilla/5.0',
        },
      }),
    )
    const user = await authenticate(req)
    expect(user.assemblyMetadata).toEqual({
      source: 'platform',
      clientIp: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    })
  })

  it('falls back to browser headers when assembly headers are missing', async () => {
    const req = new NextRequest(
      new Request(process.env.VERCEL_URL + '/?token=iu-token', {
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh)',
          'x-real-ip': '10.0.0.1',
        },
      }),
    )
    const user = await authenticate(req)
    expect(user.assemblyMetadata).toEqual({
      source: 'web',
      clientIp: '10.0.0.1',
      userAgent: 'Mozilla/5.0 (Macintosh)',
    })
  })

  it('uses "public" as source fallback for public routes', async () => {
    const req = new NextRequest(new Request(process.env.VERCEL_URL + '/api/tasks/public/?token=iu-token'))
    const user = await authenticate(req)
    expect(user.assemblyMetadata?.source).toBe('public')
  })
})
