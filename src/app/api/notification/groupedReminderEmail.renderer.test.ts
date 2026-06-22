import { TaskReminderType } from '@prisma/client'
import { ReminderEntry, renderGroupedReminderEmail } from './groupedReminderEmail.renderer'

describe('renderGroupedReminderEmail', () => {
  it('renders N=2 grouped reminder with correct subject, header, title, and body', () => {
    const entries: ReminderEntry[] = [
      { taskTitle: 'Submit tax documents', reminderType: TaskReminderType.DUE_DATE_TODAY },
      { taskTitle: 'Review contract', reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D },
    ]
    const result = renderGroupedReminderEmail(entries)

    expect(result.subject).toBe('[Reminder] You have 2 tasks to complete')
    expect(result.header).toBe('Task reminders')
    expect(result.title).toBe('View all tasks')
    expect(result.body).toBe(["- 'Submit tax documents' - Due today", "- 'Review contract' - Overdue by 3 days"].join('\n'))
  })

  it('singularizes "task" in subject when N=1', () => {
    const result = renderGroupedReminderEmail([{ taskTitle: 'Only task', reminderType: TaskReminderType.DUE_DATE_TODAY }])
    expect(result.subject).toBe('[Reminder] You have 1 task to complete')
  })

  it('renders 4 tasks with one line per task', () => {
    const entries: ReminderEntry[] = [
      { taskTitle: 'Task A', reminderType: TaskReminderType.DUE_DATE_TODAY },
      { taskTitle: 'Task B', reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D },
      { taskTitle: 'Task C', reminderType: TaskReminderType.NO_DUE_DATE_3D },
      { taskTitle: 'Task D', reminderType: TaskReminderType.DUE_DATE_BEFORE_3D },
    ]
    const result = renderGroupedReminderEmail(entries)
    expect(result.subject).toBe('[Reminder] You have 4 tasks to complete')
    expect(result.body.split('\n')).toHaveLength(4)
  })

  it.each([
    [TaskReminderType.NO_DUE_DATE_3D, 'Pending (assigned 3 days ago)'],
    [TaskReminderType.NO_DUE_DATE_7D, 'Pending (assigned 7 days ago)'],
    [TaskReminderType.DUE_DATE_BEFORE_3D, 'Due in 3 days'],
    [TaskReminderType.DUE_DATE_TODAY, 'Due today'],
    [TaskReminderType.DUE_DATE_OVERDUE_3D, 'Overdue by 3 days'],
    [TaskReminderType.DUE_DATE_OVERDUE_7D, 'Overdue by one week'],
  ])('maps %s to the correct label', (reminderType, expectedLabel) => {
    const result = renderGroupedReminderEmail([
      { taskTitle: 'A task', reminderType },
      { taskTitle: 'Another task', reminderType: TaskReminderType.DUE_DATE_TODAY },
    ])
    expect(result.body).toContain(expectedLabel)
  })
})
