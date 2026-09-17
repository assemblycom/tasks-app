import { mockTokenPayloads } from '@/app/api/tests/__mocks__/mockData'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { getSafeTokenPayload } from '@/utils/tokenPayload'

const mockGetTokenPayload = jest.fn()
const launchToken = 'a'.repeat(64)

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

    await expect(getSafeTokenPayload({ token: launchToken })).resolves.toEqual(mockTokenPayloads.client)
    expect(CopilotAPI).toHaveBeenCalledWith(launchToken)
  })

  it('returns null without constructing the SDK for impossible token strings', async () => {
    await expect(getSafeTokenPayload({ token: 'invalid-token' })).resolves.toBeNull()
    expect(CopilotAPI).not.toHaveBeenCalled()
  })

  it('returns null when Copilot cannot authorize the token', async () => {
    mockGetTokenPayload.mockRejectedValueOnce(new Error('Unable to authorize Copilot SDK'))

    await expect(getSafeTokenPayload({ token: launchToken })).resolves.toBeNull()
  })

  it('returns null when Copilot returns an auth failure status', async () => {
    mockGetTokenPayload.mockRejectedValueOnce({ status: 401 })

    await expect(getSafeTokenPayload({ token: launchToken })).resolves.toBeNull()
  })

  it('returns null for malformed token payloads', async () => {
    mockGetTokenPayload.mockResolvedValueOnce({ workspaceId: 123 })

    await expect(getSafeTokenPayload({ token: launchToken })).resolves.toBeNull()
  })

  it('throws unexpected errors', async () => {
    const error = new Error('network unavailable')
    mockGetTokenPayload.mockRejectedValueOnce(error)

    await expect(getSafeTokenPayload({ token: launchToken })).rejects.toThrow(error)
  })
})
