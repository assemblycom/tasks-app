import { GET } from '@api/activity-logs/[id]/route'
import { ActivityLogService } from '@api/activity-logs/services/activity-log.service'
import APIError from '@api/core/exceptions/api'
import authenticate from '@api/core/utils/authenticate'
import User from '@api/core/models/User.model'
import { buildNextRequest } from '@api/tests/__utils__/testUtils'
import httpStatus from 'http-status'
import { z } from 'zod'

jest.mock('@api/activity-logs/services/activity-log.service', () => ({
  ActivityLogService: jest.fn().mockImplementation(() => ({
    get: (taskId: string) => {
      z.string().uuid().parse(taskId)
      return Promise.resolve([])
    },
  })),
}))

jest.mock('@api/core/utils/authenticate', () => jest.fn())

describe('activity log route', () => {
  const mockUser = new User('iu-token', {
    workspaceId: 'workspace-id',
    internalUserId: 'internal-user-id',
  })

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation()
    jest.mocked(authenticate).mockResolvedValue(mockUser)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns a quiet 401 response when token is missing', async () => {
    jest.mocked(authenticate).mockRejectedValue(new APIError(httpStatus.UNAUTHORIZED, 'Please provide a valid token'))

    const req = buildNextRequest('/api/activity-logs/activity-id')
    const response = await GET(req, { params: Promise.resolve({ id: 'activity-id' }) })
    const body = await response.json()

    expect(response.status).toBe(httpStatus.UNAUTHORIZED)
    expect(body.error).toBe('Please provide a valid token')
    expect(console.error).not.toHaveBeenCalled()
  })

  it('returns a quiet 422 response when task id is not a valid UUID', async () => {
    const req = buildNextRequest('/api/activity-logs/not-a-uuid?token=iu-token')
    const response = await GET(req, { params: Promise.resolve({ id: 'not-a-uuid' }) })
    const body = await response.json()

    expect(response.status).toBe(httpStatus.UNPROCESSABLE_ENTITY)
    expect(body.error).toContain('Invalid uuid')
    expect(console.error).not.toHaveBeenCalled()
    expect(ActivityLogService).toHaveBeenCalledWith(mockUser)
  })
})
