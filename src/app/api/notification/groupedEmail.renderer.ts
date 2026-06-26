import { GroupedEmailEventType } from '@prisma/client'
import { escapeHtml } from '@/utils/escapeHtml'
import { GroupedEmailContent, GroupedEmailSection } from './groupedEmail.composer'

export const GROUPED_EMAIL_HEADER = 'Catch up on task activity'
export const GROUPED_EMAIL_CTA_TITLE = 'View all tasks'

export interface GroupedEmailDetails {
  subject: string
  header: string
  title: string
  htmlBody: string
}

const pluralize = (count: number, singular: string, plural: string): string => (count === 1 ? singular : plural)

const sectionHeading: Record<GroupedEmailEventType, (count: number) => string> = {
  [GroupedEmailEventType.ASSIGNED]: (count) => `${count} ${pluralize(count, 'task', 'tasks')} assigned to you`,
  [GroupedEmailEventType.SHARED]: (count) => `${count} ${pluralize(count, 'task', 'tasks')} shared with you`,
  [GroupedEmailEventType.COMMENT]: (count) =>
    `${count} ${pluralize(count, 'comment', 'comments')} ${pluralize(count, 'was', 'were')} added`,
  [GroupedEmailEventType.COMPLETED]: (count) => `${count} ${pluralize(count, 'task', 'tasks')} completed`,
}

const renderSection = (section: GroupedEmailSection): string => {
  const items = section.taskNames.map((name) => `<li>'${escapeHtml(name)}'</li>`).join('')
  const overflow =
    section.overflowCount > 0
      ? `<em>+${section.overflowCount} other ${pluralize(section.overflowCount, 'task', 'tasks')}</em>`
      : ''
  return `<strong>${sectionHeading[section.eventType](section.count)}</strong><ul>${items}</ul>${overflow}`
}

export const renderGroupedEmail = (content: GroupedEmailContent): GroupedEmailDetails => ({
  subject: `You have ${content.totalEventCount} new task ${pluralize(content.totalEventCount, 'update', 'updates')}`,
  header: GROUPED_EMAIL_HEADER,
  title: GROUPED_EMAIL_CTA_TITLE,
  htmlBody: content.sections.map(renderSection).join(''),
})
