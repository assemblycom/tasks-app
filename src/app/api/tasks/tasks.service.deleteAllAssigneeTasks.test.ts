const mockTaskFindMany = jest.fn()
const mockTaskDeleteMany = jest.fn()

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      task: { findMany: mockTaskFindMany, deleteMany: mockTaskDeleteMany },
    }),
  },
}))

jest.mock('@/utils/CopilotAPI', () => ({
  __esModule: true,
  CopilotAPI: jest.fn().mockImplementation(() => ({})),
}))

import User from '@api/core/models/User.model'
import { TasksService } from '@api/tasks/tasks.service'
import { AssigneeType } from '@prisma/client'

const makeUser = () =>
  new User('token', {
    internalUserId: 'iu-1',
    workspaceId: 'ws-1',
  } as never)

describe('TasksService.deleteAllAssigneeTasks', () => {
  beforeEach(() => {
    mockTaskFindMany.mockReset()
    mockTaskDeleteMany.mockReset()
  })

  it('deletes the assignee tasks scoped to the workspace', async () => {
    mockTaskFindMany.mockResolvedValue([{ id: 'task-a' }])

    await new TasksService(makeUser()).deleteAllAssigneeTasks('assignee-1', AssigneeType.client)

    expect(mockTaskDeleteMany).toHaveBeenCalledWith({
      where: { assigneeId: 'assignee-1', assigneeType: AssigneeType.client, workspaceId: 'ws-1' },
    })
  })
})
