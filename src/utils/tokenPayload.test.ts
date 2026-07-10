import { mockTokenPayloads } from '@/app/api/tests/__mocks__/mockData'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { getSafeTokenPayload } from '@/utils/tokenPayload'

const mockGetTokenPayload = jest.fn()

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation(() => ({
    getTokenPayload: mockGetTokenPayload,
  })),
}))

describe('getSafeTokenPayload', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetTokenPayload.mockReset()
  })

  it('returns a valid token payload', async () => {
    mockGetTokenPayload.mockResolvedValueOnce(mockTokenPayloads.client)

    await expect(getSafeTokenPayload({ token: 'client-token' })).resolves.toEqual(mockTokenPayloads.client)
    expect(CopilotAPI).toHaveBeenCalledWith('client-token')
  })

  it('returns null when Copilot cannot authorize the token', async () => {
    mockGetTokenPayload.mockRejectedValueOnce(new Error('Unable to authorize Copilot SDK'))

    await expect(getSafeTokenPayload({ token: 'invalid-token' })).resolves.toBeNull()
  })

  it('returns null when Copilot returns an auth failure status', async () => {
    mockGetTokenPayload.mockRejectedValueOnce({ status: 401 })

    await expect(getSafeTokenPayload({ token: 'invalid-token' })).resolves.toBeNull()
  })

  it('returns null for malformed token payloads', async () => {
    mockGetTokenPayload.mockResolvedValueOnce({ workspaceId: 123 })

    await expect(getSafeTokenPayload({ token: 'malformed-token' })).resolves.toBeNull()
  })

  it('throws unexpected errors', async () => {
    const error = new Error('network unavailable')
    mockGetTokenPayload.mockRejectedValueOnce(error)

    await expect(getSafeTokenPayload({ token: 'client-token' })).rejects.toThrow(error)
  })
})
