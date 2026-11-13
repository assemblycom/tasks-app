import { GET } from '@api/activity-logs/[id]/route'
import APIError from '@api/core/exceptions/api'
import authenticate from '@api/core/utils/authenticate'
import { buildNextRequest } from '@api/tests/__utils__/testUtils'
import httpStatus from 'http-status'

jest.mock('@api/activity-logs/services/activity-log.service', () => ({
  ActivityLogService: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
  })),
}))

jest.mock('@api/core/utils/authenticate', () => jest.fn())

describe('activity log route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation()
    jest.mocked(authenticate).mockRejectedValue(new APIError(httpStatus.UNAUTHORIZED, 'Please provide a valid token'))
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
