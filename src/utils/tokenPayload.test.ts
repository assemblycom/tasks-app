import { Token } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { getSafeTokenPayload } from '@/utils/tokenPayload'

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn(),
}))

const mockCopilotAPI = jest.mocked(CopilotAPI)

describe('getSafeTokenPayload', () => {
  const tokenPayload: Token = {
    clientId: 'client-id',
    companyId: 'company-id',
    workspaceId: 'workspace-id',
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns a parsed token payload', async () => {
    mockCopilotAPI.mockImplementation(
      () =>
        ({
          getTokenPayload: jest.fn().mockResolvedValue(tokenPayload),
        }) as unknown as CopilotAPI,
    )

    await expect(getSafeTokenPayload('valid-token')).resolves.toEqual(tokenPayload)
  })

  it.each([
    ['null payload', null],
    ['malformed payload', { clientId: 'client-id' }],
  ])('returns null for %s', async (_name, payload) => {
    mockCopilotAPI.mockImplementation(
      () =>
        ({
          getTokenPayload: jest.fn().mockResolvedValue(payload),
        }) as unknown as CopilotAPI,
    )

    await expect(getSafeTokenPayload('invalid-token')).resolves.toBeNull()
  })

  it('returns null when the SDK throws while reading the token', async () => {
    mockCopilotAPI.mockImplementation(
      () =>
        ({
          getTokenPayload: jest.fn().mockRejectedValue(new Error('bad decrypt')),
        }) as unknown as CopilotAPI,
    )

    await expect(getSafeTokenPayload('invalid-token')).resolves.toBeNull()
  })

  it('returns null when the SDK throws while constructing the client', async () => {
    mockCopilotAPI.mockImplementation(() => {
      throw new Error('bad decrypt')
    })

    await expect(getSafeTokenPayload('invalid-token')).resolves.toBeNull()
  })
})
