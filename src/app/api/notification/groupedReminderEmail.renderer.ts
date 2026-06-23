import { TaskReminderType } from '@prisma/client'

export type ReminderEntry = {
  taskTitle: string
  reminderType: TaskReminderType
}

export interface GroupedReminderEmailDetails {
  subject: string
  header: string
  title: string
  body: string
}

const reminderLabel: Record<TaskReminderType, string> = {
  [TaskReminderType.NO_DUE_DATE_3D]: 'Pending (assigned 3 days ago)',
  [TaskReminderType.NO_DUE_DATE_7D]: 'Pending (assigned 7 days ago)',
  [TaskReminderType.DUE_DATE_BEFORE_3D]: 'Due in 3 days',
  [TaskReminderType.DUE_DATE_TODAY]: 'Due today',
  [TaskReminderType.DUE_DATE_OVERDUE_3D]: 'Overdue by 3 days',
  [TaskReminderType.DUE_DATE_OVERDUE_7D]: 'Overdue by one week',
}

export const renderGroupedReminderEmail = (entries: ReminderEntry[]): GroupedReminderEmailDetails => {
  const n = entries.length
  return {
    subject: `[Reminder] You have ${n} ${n === 1 ? 'task' : 'tasks'} to complete`,
    header: 'Task reminders',
    title: 'View all tasks',
    body: entries.map((e) => `- '${e.taskTitle}' - ${reminderLabel[e.reminderType]}`).join('\n'),
  }
}
