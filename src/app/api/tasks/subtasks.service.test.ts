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

import User from '@api/core/models/User.model'
import { SubtaskService } from './subtasks.service'

describe('SubtaskService', () => {
  const taskId = '66b59e0d-7657-4be0-8dd1-26d1a3884a51'
  const user = new User('token', {
    internalUserId: 'f9748a3f-48b7-4a46-a6ac-c36438164ff3',
    workspaceId: 'workspaceId',
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockQueryRaw.mockReset()
  })

  it('returns the ltree level when path is present', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ level: 2 }])

    await expect(new SubtaskService(user).getSubtaskCounts(taskId)).resolves.toBe(2)
    expect(mockQueryRaw).toHaveBeenCalledTimes(1)
  })

  it('falls back to parent chain depth for legacy tasks with null paths', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ level: null }]).mockResolvedValueOnce([{ level: 1 }])

    await expect(new SubtaskService(user).getSubtaskCounts(taskId)).resolves.toBe(1)
    expect(mockQueryRaw).toHaveBeenCalledTimes(2)
  })

  it('throws a not found error when the task does not exist', async () => {
    mockQueryRaw.mockResolvedValueOnce([])

    await expect(new SubtaskService(user).getSubtaskCounts(taskId)).rejects.toMatchObject({
      status: httpStatus.NOT_FOUND,
    })
  })
})
