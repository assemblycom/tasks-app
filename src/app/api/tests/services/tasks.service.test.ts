import User from '@api/core/models/User.model'
import APIError from '@api/core/exceptions/api'
import { TasksService } from '@api/tasks/tasks.service'
import httpStatus from 'http-status'

const mockGetAccessiblePathTasks = jest.fn()

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => ({})),
  },
}))

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation(() => ({})),
}))

jest.mock('@api/tasks/subtasks.service', () => ({
  SubtaskService: jest.fn().mockImplementation(() => ({
    getAccessiblePathTasks: mockGetAccessiblePathTasks,
  })),
}))

describe('TasksService', () => {
  const taskId = 'f29286b5-e2aa-4bc1-b4c7-8e7639ea8ebd'
  const workspaceId = 'workspace-id'
  let db: {
    $queryRaw: jest.Mock
    task: { findMany: jest.Mock }
  }
  let service: TasksService

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAccessiblePathTasks.mockImplementation((tasks) => tasks)
    db = {
      $queryRaw: jest.fn(),
      task: {
        findMany: jest.fn(),
      },
    }
    service = new TasksService(new User('iu-token', { internalUserId: 'internal-user-id', workspaceId }))
    service.setTransaction(db as never)
  })

  describe('getTraversalPath', () => {
    it('scopes the raw path lookup to the current workspace', async () => {
      db.$queryRaw.mockResolvedValue([{ path: 'parent_id.child_id' }])
      db.task.findMany.mockResolvedValue([
        {
          id: 'parent-id',
          title: 'Parent',
          label: 'P-1',
          clientId: null,
          companyId: null,
          internalUserId: 'internal-user-id',
          associations: [],
          isShared: false,
        },
        {
          id: 'child-id',
          title: 'Child',
          label: 'P-2',
          clientId: null,
          companyId: null,
          internalUserId: 'internal-user-id',
          associations: [],
          isShared: false,
        },
      ])

      await service.getTraversalPath(taskId)

      expect(db.$queryRaw).toHaveBeenCalledTimes(1)
      expect(db.$queryRaw.mock.calls[0][1]).toBe(taskId)
      expect(db.$queryRaw.mock.calls[0][2]).toBe(workspaceId)
    })

    it('returns not found when the task is not in the current workspace', async () => {
      db.$queryRaw.mockResolvedValue([])

      await expect(service.getTraversalPath(taskId)).rejects.toMatchObject<Partial<APIError>>({
        status: httpStatus.NOT_FOUND,
        message: 'The requested task was not found',
      })

      expect(db.task.findMany).not.toHaveBeenCalled()
    })
  })
})
