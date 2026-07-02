import { NotificationTaskActions } from '@api/core/types/tasks'
import { WorkspaceResponse } from '@/types/common'
import { getEmailDetails, getReminderEmailDetails } from './notification.helpers'
import { TaskReminderType } from '@prisma/client'

const workspace: WorkspaceResponse = {
  id: 'ws_1',
  brandName: 'Acme',
  labels: {
    individualTerm: 'client',
    individualTermPlural: 'clients',
    groupTerm: 'company',
    groupTermPlural: 'companies',
  },
}

const task = { id: 'task_1', title: 'Submit timesheet' }

describe('getReminderEmailDetails', () => {
  it('returns a value for every TaskReminderType', () => {
    const result = getReminderEmailDetails(workspace, task, false)
    const expectedKeys = Object.values(TaskReminderType).sort()
    expect(Object.keys(result).sort()).toEqual(expectedKeys)
  })

  it('matches snapshot for individual recipient', () => {
    expect(getReminderEmailDetails(workspace, task, false)).toMatchSnapshot()
  })

  it('matches snapshot for company recipient', () => {
    expect(getReminderEmailDetails(workspace, task, true)).toMatchSnapshot()
  })

  it('uses custom group term from workspace labels for company recipient', () => {
    const customWorkspace: WorkspaceResponse = {
      ...workspace,
      labels: { ...workspace.labels, groupTerm: 'team' },
    }
    const result = getReminderEmailDetails(customWorkspace, task, true)
    expect(result[TaskReminderType.NO_DUE_DATE_3D].header).toBe('A task was assigned to your team')
  })

  it('omits any `<brand> portal:` prefix from subjects (Copilot prepends it server-side)', () => {
    const result = getReminderEmailDetails(workspace, task, false)
    for (const variant of Object.values(TaskReminderType)) {
      expect(result[variant].subject).not.toMatch(/portal:/i)
    }
  })

  it('emits ctaParams with the task id for every variant', () => {
    const result = getReminderEmailDetails(workspace, task, false)
    for (const variant of Object.values(TaskReminderType)) {
      expect(result[variant].ctaParams).toEqual({ taskId: 'task_1' })
    }
  })
})

describe('getEmailDetails', () => {
  // Actions that email an IU recipient must have a template here, or the grouped
  // buffer silently skips them (in-product fires but no email is ever flushed).
  it.each([NotificationTaskActions.Assigned, NotificationTaskActions.ReassignedToIU])(
    'defines an email template for IU-recipient action %s',
    (action) => {
      const details = getEmailDetails(workspace, 'Arpan Two')[action]
      expect(details).toBeDefined()
      expect(details?.subject).toBeTruthy()
      expect(details?.body).toBeTruthy()
    },
  )
})
