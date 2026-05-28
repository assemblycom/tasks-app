import User from '@api/core/models/User.model'
import APIError from '@api/core/exceptions/api'
import { SubtaskService } from '@api/tasks/subtasks.service'
import httpStatus from 'http-status'

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => ({})),
  },
}))

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation(() => ({})),
}))

describe('SubtaskService', () => {
  const taskId = 'f29286b5-e2aa-4bc1-b4c7-8e7639ea8ebd'
  const workspaceId = 'workspace-id'
  let db: { $queryRaw: jest.Mock }
  let service: SubtaskService

  beforeEach(() => {
    jest.clearAllMocks()
    db = { $queryRaw: jest.fn() }
    service = new SubtaskService(new User('iu-token', { internalUserId: 'internal-user-id', workspaceId }))
    service.setTransaction(db as never)
  })

  describe('getSubtaskCounts', () => {
    it('returns not found when the task is not in the current workspace', async () => {
      db.$queryRaw.mockResolvedValue([])

      await expect(service.getSubtaskCounts(taskId)).rejects.toMatchObject<Partial<APIError>>({
        status: httpStatus.NOT_FOUND,
        message: 'The requested task was not found',
      })
    })

    it('keeps a server error when the task row exists without a path', async () => {
      db.$queryRaw.mockResolvedValue([{ level: null }])

      await expect(service.getSubtaskCounts(taskId)).rejects.toMatchObject<Partial<APIError>>({
        status: httpStatus.INTERNAL_SERVER_ERROR,
        message: 'Path for task was not set',
      })
    })
  })
})
