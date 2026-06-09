import { GroupedEmailEvent, GroupedEmailEventType } from '@prisma/client'

export const MAX_TASK_NAMES_PER_SECTION = 3

const SECTION_ORDER: GroupedEmailEventType[] = [
  GroupedEmailEventType.ASSIGNED,
  GroupedEmailEventType.SHARED,
  GroupedEmailEventType.COMMENT,
  GroupedEmailEventType.COMPLETED,
]

export type GroupedEmailEventInput = Pick<GroupedEmailEvent, 'eventType' | 'taskId' | 'taskTitleSnapshot' | 'createdAt'>

export interface GroupedEmailSection {
  eventType: GroupedEmailEventType
  count: number
  taskNames: string[]
  overflowCount: number
}

export interface GroupedEmailContent {
  totalEventCount: number
  sections: GroupedEmailSection[]
}

const compareByCreatedAtThenTitle = (a: GroupedEmailEventInput, b: GroupedEmailEventInput): number => {
  const byCreatedAt = a.createdAt.getTime() - b.createdAt.getTime()
  if (byCreatedAt !== 0) return byCreatedAt
  return a.taskTitleSnapshot.localeCompare(b.taskTitleSnapshot)
}

const distinctTaskNames = (events: GroupedEmailEventInput[]): string[] => {
  const seen = new Set<string>()
  const names: string[] = []
  for (const event of events) {
    if (seen.has(event.taskId)) continue
    seen.add(event.taskId)
    names.push(event.taskTitleSnapshot)
  }
  return names
}

const buildSection = (eventType: GroupedEmailEventType, events: GroupedEmailEventInput[]): GroupedEmailSection | null => {
  const sectionEvents = events.filter((event) => event.eventType === eventType).sort(compareByCreatedAtThenTitle)

  if (sectionEvents.length === 0) return null

  const names = distinctTaskNames(sectionEvents)

  return {
    eventType,
    count: sectionEvents.length,
    taskNames: names.slice(0, MAX_TASK_NAMES_PER_SECTION),
    overflowCount: Math.max(0, names.length - MAX_TASK_NAMES_PER_SECTION),
  }
}

export const composeGroupedEmail = (events: GroupedEmailEventInput[]): GroupedEmailContent => {
  const sections = SECTION_ORDER.map((eventType) => buildSection(eventType, events)).filter(
    (section): section is GroupedEmailSection => section !== null,
  )

  return { totalEventCount: events.length, sections }
}
