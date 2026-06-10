import { GroupedEmailEventType } from '@prisma/client'
import { GroupedEmailContent } from './groupedEmail.composer'
import { GROUPED_EMAIL_CTA_TITLE, GROUPED_EMAIL_HEADER, renderGroupedEmail } from './groupedEmail.renderer'

const section = (overrides: Partial<GroupedEmailContent['sections'][number]> = {}) => ({
  eventType: GroupedEmailEventType.ASSIGNED,
  count: 1,
  taskNames: ['Task A'],
  overflowCount: 0,
  ...overrides,
})

describe('renderGroupedEmail', () => {
  it('renders the PRD sample (assigned + shared + comment) as dashed plain text', () => {
    const content: GroupedEmailContent = {
      totalEventCount: 6,
      sections: [
        {
          eventType: GroupedEmailEventType.ASSIGNED,
          count: 3,
          taskNames: ['Q4 Tax Document Upload', 'Complete W-9 Form', 'Review Engagement Letter'],
          overflowCount: 0,
        },
        {
          eventType: GroupedEmailEventType.SHARED,
          count: 2,
          taskNames: ['Annual Filing Preparation', 'Bookkeeping Review'],
          overflowCount: 0,
        },
        {
          eventType: GroupedEmailEventType.COMMENT,
          count: 1,
          taskNames: ['Task with a conversation'],
          overflowCount: 0,
        },
      ],
    }

    const email = renderGroupedEmail(content)

    expect(email.subject).toBe('You have 6 new task updates')
    expect(email.header).toBe(GROUPED_EMAIL_HEADER)
    expect(email.title).toBe(GROUPED_EMAIL_CTA_TITLE)
    expect(email.body).toBe(
      [
        '3 tasks assigned to you',
        '- ‘Q4 Tax Document Upload’',
        '- ‘Complete W-9 Form’',
        '- ‘Review Engagement Letter’',
        '',
        '2 tasks shared with you',
        '- ‘Annual Filing Preparation’',
        '- ‘Bookkeeping Review’',
        '',
        '1 comment was added',
        '- ‘Task with a conversation’',
      ].join('\n'),
    )
  })

  it('renders the "+N other tasks" overflow line', () => {
    const email = renderGroupedEmail({
      totalEventCount: 12,
      sections: [section({ count: 12, taskNames: ['A', 'B', 'C'], overflowCount: 9 })],
    })

    expect(email.body).toBe(['12 tasks assigned to you', '- ‘A’', '- ‘B’', '- ‘C’', '+9 other tasks'].join('\n'))
  })

  it('singularizes the overflow line for a single other task', () => {
    const email = renderGroupedEmail({
      totalEventCount: 4,
      sections: [section({ count: 4, taskNames: ['A', 'B', 'C'], overflowCount: 1 })],
    })

    expect(email.body).toContain('+1 other task')
    expect(email.body).not.toContain('+1 other tasks')
  })

  it('uses singular copy for the subject when there is one update', () => {
    const email = renderGroupedEmail({
      totalEventCount: 1,
      sections: [section()],
    })

    expect(email.subject).toBe('You have 1 new task update')
  })

  it.each([
    [GroupedEmailEventType.ASSIGNED, 1, '1 task assigned to you'],
    [GroupedEmailEventType.ASSIGNED, 3, '3 tasks assigned to you'],
    [GroupedEmailEventType.SHARED, 1, '1 task shared with you'],
    [GroupedEmailEventType.SHARED, 2, '2 tasks shared with you'],
    [GroupedEmailEventType.COMMENT, 1, '1 comment was added'],
    [GroupedEmailEventType.COMMENT, 4, '4 comments were added'],
    [GroupedEmailEventType.COMPLETED, 1, '1 task completed'],
    [GroupedEmailEventType.COMPLETED, 2, '2 tasks completed'],
  ])('renders the %s heading correctly for count %i', (eventType, count, expected) => {
    const email = renderGroupedEmail({
      totalEventCount: count,
      sections: [section({ eventType, count, taskNames: ['Task A'] })],
    })

    expect(email.body.split('\n')[0]).toBe(expected)
  })

  it('returns an empty body when there are no sections', () => {
    expect(renderGroupedEmail({ totalEventCount: 0, sections: [] }).body).toBe('')
  })
})
