import { GroupedEmailEventType } from '@prisma/client'
import { composeGroupedEmail, GroupedEmailEventInput, MAX_TASK_NAMES_PER_SECTION } from './groupedEmail.composer'

let seq = 0

const event = (overrides: Partial<GroupedEmailEventInput> = {}): GroupedEmailEventInput => {
  seq += 1
  return {
    eventType: GroupedEmailEventType.ASSIGNED,
    taskId: `task_${seq}`,
    taskTitleSnapshot: `Task ${seq}`,
    createdAt: new Date(`2026-06-09T10:00:${String(seq).padStart(2, '0')}.000Z`),
    ...overrides,
  }
}

const sectionFor = (events: GroupedEmailEventInput[], type: GroupedEmailEventType) =>
  composeGroupedEmail(events).sections.find((section) => section.eventType === type)

describe('composeGroupedEmail', () => {
  it('orders sections ASSIGNED → SHARED → COMMENT → COMPLETED regardless of input order', () => {
    const events = [
      event({ eventType: GroupedEmailEventType.COMMENT }),
      event({ eventType: GroupedEmailEventType.COMPLETED }),
      event({ eventType: GroupedEmailEventType.ASSIGNED }),
      event({ eventType: GroupedEmailEventType.SHARED }),
    ]

    const result = composeGroupedEmail(events)

    expect(result.sections.map((section) => section.eventType)).toEqual([
      GroupedEmailEventType.ASSIGNED,
      GroupedEmailEventType.SHARED,
      GroupedEmailEventType.COMMENT,
      GroupedEmailEventType.COMPLETED,
    ])
  })

  it('omits sections that have no events', () => {
    const events = [
      event({ eventType: GroupedEmailEventType.ASSIGNED }),
      event({ eventType: GroupedEmailEventType.COMMENT }),
    ]

    expect(composeGroupedEmail(events).sections.map((section) => section.eventType)).toEqual([
      GroupedEmailEventType.ASSIGNED,
      GroupedEmailEventType.COMMENT,
    ])
  })

  it('returns no sections and a zero count when there are no events', () => {
    expect(composeGroupedEmail([])).toEqual({ totalEventCount: 0, sections: [] })
  })

  it('counts every buffered event in totalEventCount', () => {
    const events = [
      event({ eventType: GroupedEmailEventType.ASSIGNED }),
      event({ eventType: GroupedEmailEventType.ASSIGNED }),
      event({ eventType: GroupedEmailEventType.ASSIGNED }),
      event({ eventType: GroupedEmailEventType.SHARED }),
      event({ eventType: GroupedEmailEventType.SHARED }),
      event({ eventType: GroupedEmailEventType.COMMENT }),
    ]

    expect(composeGroupedEmail(events).totalEventCount).toBe(6)
  })

  it('section counts sum to totalEventCount', () => {
    const events = [
      event({ eventType: GroupedEmailEventType.ASSIGNED }),
      event({ eventType: GroupedEmailEventType.SHARED }),
      event({ eventType: GroupedEmailEventType.SHARED }),
      event({ eventType: GroupedEmailEventType.COMMENT }),
    ]

    const result = composeGroupedEmail(events)
    const summed = result.sections.reduce((total, section) => total + section.count, 0)

    expect(summed).toBe(result.totalEventCount)
  })

  it('caps task names at 3 and reports the rest as overflow', () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      event({ eventType: GroupedEmailEventType.ASSIGNED, taskId: `t_${i}`, taskTitleSnapshot: `Task ${i}` }),
    )

    const section = sectionFor(events, GroupedEmailEventType.ASSIGNED)

    expect(section?.count).toBe(5)
    expect(section?.taskNames).toHaveLength(MAX_TASK_NAMES_PER_SECTION)
    expect(section?.overflowCount).toBe(2)
  })

  it('has zero overflow when a section has 3 or fewer tasks', () => {
    const events = [event({ eventType: GroupedEmailEventType.SHARED }), event({ eventType: GroupedEmailEventType.SHARED })]

    const section = sectionFor(events, GroupedEmailEventType.SHARED)

    expect(section?.taskNames).toHaveLength(2)
    expect(section?.overflowCount).toBe(0)
  })

  it('sorts task names by createdAt then title', () => {
    const events = [
      event({ taskTitleSnapshot: 'Third', createdAt: new Date('2026-06-09T10:03:00.000Z') }),
      event({ taskTitleSnapshot: 'Banana', createdAt: new Date('2026-06-09T10:01:00.000Z') }),
      event({ taskTitleSnapshot: 'Apple', createdAt: new Date('2026-06-09T10:01:00.000Z') }),
    ]

    const section = sectionFor(events, GroupedEmailEventType.ASSIGNED)

    expect(section?.taskNames).toEqual(['Apple', 'Banana', 'Third'])
  })

  it('counts multiple comments on one task as separate events but lists the task once', () => {
    const events = [
      event({ eventType: GroupedEmailEventType.COMMENT, taskId: 'task_a', taskTitleSnapshot: 'Conversation' }),
      event({ eventType: GroupedEmailEventType.COMMENT, taskId: 'task_a', taskTitleSnapshot: 'Conversation' }),
      event({ eventType: GroupedEmailEventType.COMMENT, taskId: 'task_a', taskTitleSnapshot: 'Conversation' }),
    ]

    const result = composeGroupedEmail(events)
    const section = sectionFor(events, GroupedEmailEventType.COMMENT)

    expect(result.totalEventCount).toBe(3)
    expect(section?.count).toBe(3)
    expect(section?.taskNames).toEqual(['Conversation'])
    expect(section?.overflowCount).toBe(0)
  })
})
