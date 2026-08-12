const mockQueryRawUnsafe = jest.fn()
const mockTaskDeleteMany = jest.fn()
const mockLabelDeleteMany = jest.fn()

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      $queryRawUnsafe: mockQueryRawUnsafe,
      task: { deleteMany: mockTaskDeleteMany },
      label: { deleteMany: mockLabelDeleteMany },
    }),
  },
}))

jest.mock('@/utils/CopilotAPI', () => ({ CopilotAPI: jest.fn() }))

import { SubtaskService } from '@api/tasks/subtasks.service'
import User from '@api/core/models/User.model'
import { UserRole } from '@api/core/types/user'

const user = {
  workspaceId: 'ws-1',
  role: UserRole.IU,
  internalUserId: 'iu-1',
  token: 'token',
} as unknown as User

describe('SubtaskService#softDeleteAllSubtasks', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deletes descendant tasks by id scoped to the workspace', async () => {
    mockQueryRawUnsafe.mockResolvedValue([{ id: 'task-a' }, { id: 'task-b' }])

    await new SubtaskService(user).softDeleteAllSubtasks('parent-id')

    expect(mockTaskDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['task-a', 'task-b'] }, workspaceId: 'ws-1' },
    })
  })

  it('never deletes Labels registry rows', async () => {
    mockQueryRawUnsafe.mockResolvedValue([{ id: 'task-a' }])

    await new SubtaskService(user).softDeleteAllSubtasks('parent-id')

    expect(mockLabelDeleteMany).not.toHaveBeenCalled()
  })
})
