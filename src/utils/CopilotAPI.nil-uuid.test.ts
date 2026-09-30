import APIError from '@/app/api/core/exceptions/api'
import httpStatus from 'http-status'
import { NIL_UUID } from '@/utils/uuid'

const mockRetrieveInternalUser = jest.fn()
const mockRetrieveClient = jest.fn()

jest.mock('@/app/api/core/utils/withRetry', () => ({
  withRetry: async (fn: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => fn(...args),
  RETRY_404_ENABLED: false,
}))

jest.mock('copilot-node-sdk', () => ({
  copilotApi: () => ({
    retrieveInternalUser: mockRetrieveInternalUser,
    retrieveClient: mockRetrieveClient,
    getTokenPayload: jest.fn(),
  }),
}))

import { CopilotAPI } from '@/utils/CopilotAPI'

describe('CopilotAPI nil UUID guards', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects nil UUID for getInternalUser without calling Copilot', async () => {
    const copilot = new CopilotAPI('token')

    await expect(copilot.getInternalUser(NIL_UUID)).rejects.toBeInstanceOf(APIError)
    await expect(copilot.getInternalUser(NIL_UUID)).rejects.toMatchObject({
      status: httpStatus.BAD_REQUEST,
      message: 'Invalid internal user id',
    })
    expect(mockRetrieveInternalUser).not.toHaveBeenCalled()
  })

  it('rejects nil UUID for getClient without calling Copilot', async () => {
    const copilot = new CopilotAPI('token')

    await expect(copilot.getClient(NIL_UUID)).rejects.toBeInstanceOf(APIError)
    await expect(copilot.getClient(NIL_UUID)).rejects.toMatchObject({
      status: httpStatus.BAD_REQUEST,
      message: 'Invalid client id',
    })
    expect(mockRetrieveClient).not.toHaveBeenCalled()
  })

  it('returns null from me when token id is nil UUID', async () => {
    const copilot = new CopilotAPI('token')
    jest.spyOn(copilot, 'getTokenPayload').mockResolvedValue({
      internalUserId: NIL_UUID,
      workspaceId: 'workspace-id',
    })

    await expect(copilot.me()).resolves.toBeNull()
    expect(mockRetrieveInternalUser).not.toHaveBeenCalled()
    expect(mockRetrieveClient).not.toHaveBeenCalled()
  })
})
