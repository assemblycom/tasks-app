const mockNotificationCreate = jest.fn().mockResolvedValue({ id: 'notification-1' })

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: { getInstance: () => ({}) },
}))

jest.mock('@/utils/CopilotAPI', () => ({
  __esModule: true,
  CopilotAPI: jest.fn().mockImplementation(() => ({})),
}))

jest.mock('@api/notification/notification.service', () => ({
  __esModule: true,
  NotificationService: jest.fn().mockImplementation(() => ({ create: mockNotificationCreate })),
}))

import { AssemblySource } from '@/constants/assemblySource'
import { TaskWithWorkflowState } from '@/types/db'
import User from '@api/core/models/User.model'
import { NotificationTaskActions } from '@api/core/types/tasks'
import { TaskNotificationsService } from '@api/tasks/task-notifications.service'
import { AssigneeType, StateType } from '@prisma/client'

const IU_ID = 'iu-1'

const makeUser = (source: string) => {
  const user = new User('token', { internalUserId: IU_ID, workspaceId: 'ws-1' } as never)
  user.assemblyMetadata = { source }
  return user
}

// A task the acting IU created and assigned to themself, with nothing else that would gate notifications.
const selfAssignedTask = {
  id: 'task-1',
  workspaceId: 'ws-1',
  createdById: IU_ID,
  assigneeId: IU_ID,
  assigneeType: AssigneeType.internalUser,
  parentId: null,
  isShared: false,
  associations: [],
  workflowState: { type: StateType.unstarted },
} as unknown as TaskWithWorkflowState

describe('TaskNotificationsService.sendTaskCreateNotifications', () => {
  beforeEach(() => mockNotificationCreate.mockClear())

  it('does not notify an IU who created a task for themself in the app', async () => {
    await new TaskNotificationsService(makeUser(AssemblySource.web)).sendTaskCreateNotifications({ task: selfAssignedTask })

    expect(mockNotificationCreate).not.toHaveBeenCalled()
  })

  it('notifies the automation creator when their automation assigns a task to them', async () => {
    await new TaskNotificationsService(makeUser(AssemblySource.automation)).sendTaskCreateNotifications({
      task: selfAssignedTask,
    })

    expect(mockNotificationCreate).toHaveBeenCalledWith(
      NotificationTaskActions.Assigned,
      selfAssignedTask,
      expect.anything(),
    )
  })
})
