import { TaskReminderType } from '@prisma/client'

export type ReminderEntry = {
  taskTitle: string
  reminderType: TaskReminderType
}

export interface GroupedReminderEmailDetails {
  subject: string
  header: string
  title: string
  htmlBody: string
}

const MAX_TITLE_LENGTH = 60
const ITEMS_PER_GROUP = 3

const reminderLabel: Record<TaskReminderType, string> = {
  [TaskReminderType.DUE_DATE_OVERDUE_7D]: 'Overdue by one week',
  [TaskReminderType.DUE_DATE_OVERDUE_3D]: 'Overdue by 3 days',
  [TaskReminderType.DUE_DATE_TODAY]: 'Due today',
  [TaskReminderType.DUE_DATE_BEFORE_3D]: 'Due in 3 days',
  [TaskReminderType.NO_DUE_DATE_3D]: 'Assigned 3 days ago',
  [TaskReminderType.NO_DUE_DATE_7D]: 'Assigned 7 days ago',
}

const urgencyOrder: Record<TaskReminderType, number> = {
  [TaskReminderType.DUE_DATE_OVERDUE_7D]: 0,
  [TaskReminderType.DUE_DATE_OVERDUE_3D]: 1,
  [TaskReminderType.DUE_DATE_TODAY]: 2,
  [TaskReminderType.DUE_DATE_BEFORE_3D]: 3,
  [TaskReminderType.NO_DUE_DATE_3D]: 4,
  [TaskReminderType.NO_DUE_DATE_7D]: 5,
}

type UrgencyGroup = 'Overdue' | 'Due soon' | 'No due date'

const reminderGroup: Record<TaskReminderType, UrgencyGroup> = {
  [TaskReminderType.DUE_DATE_OVERDUE_7D]: 'Overdue',
  [TaskReminderType.DUE_DATE_OVERDUE_3D]: 'Overdue',
  [TaskReminderType.DUE_DATE_TODAY]: 'Due soon',
  [TaskReminderType.DUE_DATE_BEFORE_3D]: 'Due soon',
  [TaskReminderType.NO_DUE_DATE_3D]: 'No due date',
  [TaskReminderType.NO_DUE_DATE_7D]: 'No due date',
}

const GROUP_ORDER: UrgencyGroup[] = ['Overdue', 'Due soon', 'No due date']

const truncateTitle = (title: string): string =>
  title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH)}…` : title

const pluralize = (n: number, singular: string, plural: string): string => (n === 1 ? singular : plural)

const renderGroup = (group: UrgencyGroup, entries: ReminderEntry[]): string => {
  const shown = entries.slice(0, ITEMS_PER_GROUP)
  const overflow = entries.length - shown.length
  const items = shown
    .map((e) => `<li>‘${truncateTitle(e.taskTitle)}’ – <em>${reminderLabel[e.reminderType]}</em></li>`)
    .join('')
  const overflowHtml = overflow > 0 ? `<em>+${overflow} other ${pluralize(overflow, 'task', 'tasks')}</em>` : ''
  return `<strong>${group}</strong><ul>${items}</ul>${overflowHtml}`
}

export const renderGroupedReminderEmail = (entries: ReminderEntry[]): GroupedReminderEmailDetails => {
  const sorted = [...entries].sort((a, b) => urgencyOrder[a.reminderType] - urgencyOrder[b.reminderType])

  const grouped = new Map<UrgencyGroup, ReminderEntry[]>()
  for (const entry of sorted) {
    const group = reminderGroup[entry.reminderType]
    if (!grouped.has(group)) grouped.set(group, [])
    grouped.get(group)!.push(entry)
  }

  const htmlBody = GROUP_ORDER.filter((group) => grouped.has(group))
    .map((group) => renderGroup(group, grouped.get(group)!))
    .join('')

  const n = entries.length
  return {
    subject: `[Reminder] You have ${n} ${pluralize(n, 'task', 'tasks')} to complete`,
    header: 'Tasks that need your attention',
    title: 'View all tasks',
    htmlBody,
  }
}
