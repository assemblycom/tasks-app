import { TaskReminderType } from '@prisma/client'
import { ReminderEntry, renderGroupedReminderEmail } from './groupedReminderEmail.renderer'

describe('renderGroupedReminderEmail', () => {
  it('renders correct subject, header, title, and sorted grouped htmlBody', () => {
    const entries: ReminderEntry[] = [
      { taskTitle: 'Submit tax documents', reminderType: TaskReminderType.DUE_DATE_TODAY },
      { taskTitle: 'Review contract', reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D },
    ]
    const result = renderGroupedReminderEmail(entries)

    expect(result.subject).toBe('[Reminder] You have 2 tasks to complete')
    expect(result.header).toBe('Tasks that need your attention')
    expect(result.title).toBe('View all tasks')
    // Overdue sorts before Due soon; curly quotes
    expect(result.htmlBody).toBe(
      '<strong>Overdue</strong><ul><li>‘Review contract’ – <em>Overdue by 3 days</em></li></ul><strong>Due soon</strong><ul><li>‘Submit tax documents’ – <em>Due today</em></li></ul>',
    )
  })

  it('singularizes "task" in subject when N=1', () => {
    const result = renderGroupedReminderEmail([{ taskTitle: 'Only task', reminderType: TaskReminderType.DUE_DATE_TODAY }])
    expect(result.subject).toBe('[Reminder] You have 1 task to complete')
  })

  it('renders 4 tasks as 4 li elements across groups', () => {
    const entries: ReminderEntry[] = [
      { taskTitle: 'Task A', reminderType: TaskReminderType.DUE_DATE_TODAY },
      { taskTitle: 'Task B', reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D },
      { taskTitle: 'Task C', reminderType: TaskReminderType.NO_DUE_DATE_3D },
      { taskTitle: 'Task D', reminderType: TaskReminderType.DUE_DATE_BEFORE_3D },
    ]
    const result = renderGroupedReminderEmail(entries)
    expect(result.subject).toBe('[Reminder] You have 4 tasks to complete')
    expect(result.htmlBody.match(/<li>/g)).toHaveLength(4)
  })

  it('caps each urgency group at 3 and shows overflow count', () => {
    const entries: ReminderEntry[] = [
      { taskTitle: 'Overdue 1', reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D },
      { taskTitle: 'Overdue 2', reminderType: TaskReminderType.DUE_DATE_OVERDUE_7D },
      { taskTitle: 'Overdue 3', reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D },
      { taskTitle: 'Overdue 4', reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D },
    ]
    const result = renderGroupedReminderEmail(entries)
    expect(result.htmlBody.match(/<li>/g)).toHaveLength(4)
    expect(result.htmlBody).toContain('<li><em>+1 other task</em></li>')
  })

  it('pluralizes overflow when more than 1 task is hidden', () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      taskTitle: `Task ${i}`,
      reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D,
    }))
    const result = renderGroupedReminderEmail(entries)
    expect(result.htmlBody).toContain('<li><em>+2 other tasks</em></li>')
  })

  it('truncates task titles longer than 100 characters', () => {
    const longTitle = 'A'.repeat(105)
    const result = renderGroupedReminderEmail([{ taskTitle: longTitle, reminderType: TaskReminderType.DUE_DATE_TODAY }])
    expect(result.htmlBody).toContain('A'.repeat(100) + '…')
    expect(result.htmlBody).not.toContain('A'.repeat(101))
  })

  it('sorts entries by urgency: overdue first, no-due-date last', () => {
    const entries: ReminderEntry[] = [
      { taskTitle: 'No due date task', reminderType: TaskReminderType.NO_DUE_DATE_3D },
      { taskTitle: 'Due today task', reminderType: TaskReminderType.DUE_DATE_TODAY },
      { taskTitle: 'Overdue task', reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D },
    ]
    const result = renderGroupedReminderEmail(entries)
    const overduePos = result.htmlBody.indexOf('Overdue task')
    const todayPos = result.htmlBody.indexOf('Due today task')
    const noDueDatePos = result.htmlBody.indexOf('No due date task')
    expect(overduePos).toBeLessThan(todayPos)
    expect(todayPos).toBeLessThan(noDueDatePos)
  })

  it.each([
    [TaskReminderType.NO_DUE_DATE_3D, 'Assigned 3 days ago'],
    [TaskReminderType.NO_DUE_DATE_7D, 'Assigned 7 days ago'],
    [TaskReminderType.DUE_DATE_BEFORE_3D, 'Due in 3 days'],
    [TaskReminderType.DUE_DATE_TODAY, 'Due today'],
    [TaskReminderType.DUE_DATE_OVERDUE_3D, 'Overdue by 3 days'],
    [TaskReminderType.DUE_DATE_OVERDUE_7D, 'Overdue by one week'],
  ])('maps %s to the correct label', (reminderType, expectedLabel) => {
    const result = renderGroupedReminderEmail([
      { taskTitle: 'A task', reminderType },
      { taskTitle: 'Another task', reminderType: TaskReminderType.DUE_DATE_TODAY },
    ])
    expect(result.htmlBody).toContain(expectedLabel)
  })
})
