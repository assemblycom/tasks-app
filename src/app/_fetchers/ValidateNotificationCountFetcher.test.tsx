import { getCopilotAppId } from '@/config'
import { ValidateNotificationCountFetcher } from './ValidateNotificationCountFetcher'

jest.mock('@/config', () => ({
  apiUrl: 'https://tasks.example.com',
  getCopilotAppId: jest.fn(),
}))

const mockGetCopilotAppId = getCopilotAppId as jest.Mock

describe('ValidateNotificationCountFetcher', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('does not call validate-count when Copilot app id is missing', async () => {
    mockGetCopilotAppId.mockReturnValue('')

    await ValidateNotificationCountFetcher({ token: 'client-token' })

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('calls validate-count when Copilot app id is configured', async () => {
    mockGetCopilotAppId.mockReturnValue('app-id')

    await ValidateNotificationCountFetcher({ token: 'client-token' })

    expect(global.fetch).toHaveBeenCalledWith('https://tasks.example.com/api/notification/validate-count?token=client-token')
  })
})
