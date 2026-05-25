import { WorkspaceResponse } from '@/types/common'
import { getReminderEmailDetails } from './notification.helpers'
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

  it('falls back gracefully when brandName is missing', () => {
    const noBrand: WorkspaceResponse = { ...workspace, brandName: undefined }
    const result = getReminderEmailDetails(noBrand, task, false)
    expect(result[TaskReminderType.NO_DUE_DATE_3D].subject).toBe('portal: [Reminder] You have a task to complete')
  })

  it('emits ctaParams with the task id for every variant', () => {
    const result = getReminderEmailDetails(workspace, task, false)
    for (const variant of Object.values(TaskReminderType)) {
      expect(result[variant].ctaParams).toEqual({ taskId: 'task_1' })
    }
  })
})
