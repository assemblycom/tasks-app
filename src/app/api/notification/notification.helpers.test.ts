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

  it('omits htmlBody when no evaluationTitle is supplied', () => {
    const result = getReminderEmailDetails(workspace, task, false)
    for (const variant of Object.values(TaskReminderType)) {
      expect(result[variant].htmlBody).toBeUndefined()
    }
  })

  it('emits an evaluation htmlBody with the bolded title for every variant when opted in', () => {
    const result = getReminderEmailDetails(workspace, task, false, 'Premier Collection Mystery Shop')
    for (const variant of Object.values(TaskReminderType)) {
      expect(result[variant].htmlBody).toContain(
        'mystery shop evaluation for <strong>Premier Collection Mystery Shop</strong>',
      )
    }
  })

  it('HTML-escapes the evaluation title to prevent markup injection', () => {
    const result = getReminderEmailDetails(workspace, task, false, 'Report </strong><img src=x onerror=alert(1)>')
    const htmlBody = result[TaskReminderType.NO_DUE_DATE_3D].htmlBody
    expect(htmlBody).toContain('Report &lt;/strong&gt;&lt;img src=x onerror=alert(1)&gt;')
    expect(htmlBody).not.toContain('<img src=x')
  })
})
