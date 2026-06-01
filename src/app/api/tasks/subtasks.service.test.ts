import APIError from '@api/core/exceptions/api'
import User from '@api/core/models/User.model'
import { SubtaskService } from '@api/tasks/subtasks.service'
import httpStatus from 'http-status'

const mockQueryRaw = jest.fn()

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      $queryRaw: mockQueryRaw,
    }),
  },
}))

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation(() => ({})),
}))

describe('SubtaskService', () => {
  const user = new User('token', {
    internalUserId: '9df40371-eae4-48bd-83a1-ac6d183b88eb',
    workspaceId: 'workspace-id',
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('uses a lazily backfilled task path when calculating subtask status', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ path: null }]).mockResolvedValueOnce([{ path: 'parent.task' }])

    const status = await new SubtaskService(user).getSubtaskStatus('cb098a99-60cd-4712-bc22-adf628dd3525')

    expect(status).toEqual({ count: 2, canCreateSubtask: false })
    expect(mockQueryRaw).toHaveBeenCalledTimes(2)
  })

  it('throws a not found error when the task path cannot be resolved', async () => {
    mockQueryRaw.mockResolvedValueOnce([])

    await expect(
      new SubtaskService(user).getSubtaskStatus('cb098a99-60cd-4712-bc22-adf628dd3525'),
    ).rejects.toMatchObject<Partial<APIError>>({
      status: httpStatus.NOT_FOUND,
      message: 'The requested task was not found',
    })
  })
})
