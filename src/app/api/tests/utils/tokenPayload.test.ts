import { getSafeTokenPayload } from '@/utils/tokenPayload'
import { CopilotAPI } from '@/utils/CopilotAPI'

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn(),
}))

const MockCopilotAPI = CopilotAPI as jest.Mock

describe('getSafeTokenPayload', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns a parsed token payload for valid Copilot tokens', async () => {
    MockCopilotAPI.mockImplementation(() => ({
      getTokenPayload: jest.fn().mockResolvedValue({
        internalUserId: 'internalUserId',
        workspaceId: 'workspaceId',
      }),
    }))

    await expect(getSafeTokenPayload('valid-token')).resolves.toEqual({
      internalUserId: 'internalUserId',
      workspaceId: 'workspaceId',
    })
  })

  it('returns null when the Copilot SDK cannot authorize the token', async () => {
    MockCopilotAPI.mockImplementation(() => {
      throw new Error('Unable to authorize Copilot SDK.')
    })

    await expect(getSafeTokenPayload('invalid-token')).resolves.toBeNull()
  })

  it('returns null when the token payload is malformed', async () => {
    MockCopilotAPI.mockImplementation(() => ({
      getTokenPayload: jest.fn().mockResolvedValue({
        internalUserId: 'internalUserId',
      }),
    }))

    await expect(getSafeTokenPayload('malformed-token')).resolves.toBeNull()
  })
})
