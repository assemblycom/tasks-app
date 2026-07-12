import { mockCopilotAPI } from '@api/tests/__mocks__/CopilotAPI.mock'
import { GET } from '@api/activity-logs/[id]/route'
import { buildNextRequest } from '@api/tests/__utils__/testUtils'
import httpStatus from 'http-status'

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation((token: string) => mockCopilotAPI(token)),
}))

describe('activity log route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns a quiet 401 response when token is missing', async () => {
    const req = buildNextRequest('/api/activity-logs/activity-id')
    const response = await GET(req, { params: Promise.resolve({ id: 'activity-id' }) })
    const body = await response.json()

    expect(response.status).toBe(httpStatus.UNAUTHORIZED)
    expect(body.error).toBe('Please provide a valid token')
    expect(console.error).not.toHaveBeenCalled()
  })
})
