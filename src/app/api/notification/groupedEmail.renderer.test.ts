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
  it('renders the PRD sample (assigned + shared + comment) as HTML', () => {
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
    expect(email.htmlBody).toBe(
      '<strong>3 tasks assigned to you</strong>' +
        "<ul><li>'Q4 Tax Document Upload'</li><li>'Complete W-9 Form'</li><li>'Review Engagement Letter'</li></ul>" +
        '<strong>2 tasks shared with you</strong>' +
        "<ul><li>'Annual Filing Preparation'</li><li>'Bookkeeping Review'</li></ul>" +
        '<strong>1 comment was added</strong>' +
        "<ul><li>'Task with a conversation'</li></ul>",
    )
  })

  it('renders the "+N other tasks" overflow with em tag', () => {
    const email = renderGroupedEmail({
      totalEventCount: 12,
      sections: [section({ count: 12, taskNames: ['A', 'B', 'C'], overflowCount: 9 })],
    })

    expect(email.htmlBody).toContain('<em>+9 other tasks</em><br>')
  })

  it('singularizes the overflow line for a single other task', () => {
    const email = renderGroupedEmail({
      totalEventCount: 4,
      sections: [section({ count: 4, taskNames: ['A', 'B', 'C'], overflowCount: 1 })],
    })

    expect(email.htmlBody).toContain('<em>+1 other task</em><br>')
    expect(email.htmlBody).not.toContain('<em>+1 other tasks</em>')
  })

  it('omits overflow element when there is no overflow', () => {
    const email = renderGroupedEmail({
      totalEventCount: 1,
      sections: [section()],
    })

    expect(email.htmlBody).not.toContain('<em>')
  })

  it('uses singular copy for the subject when there is one update', () => {
    const email = renderGroupedEmail({
      totalEventCount: 1,
      sections: [section()],
    })

    expect(email.subject).toBe('You have 1 new task update')
  })

  it.each([
    [GroupedEmailEventType.ASSIGNED, 1, '<strong>1 task assigned to you</strong>'],
    [GroupedEmailEventType.ASSIGNED, 3, '<strong>3 tasks assigned to you</strong>'],
    [GroupedEmailEventType.SHARED, 1, '<strong>1 task shared with you</strong>'],
    [GroupedEmailEventType.SHARED, 2, '<strong>2 tasks shared with you</strong>'],
    [GroupedEmailEventType.COMMENT, 1, '<strong>1 comment was added</strong>'],
    [GroupedEmailEventType.COMMENT, 4, '<strong>4 comments were added</strong>'],
    [GroupedEmailEventType.COMPLETED, 1, '<strong>1 task completed</strong>'],
    [GroupedEmailEventType.COMPLETED, 2, '<strong>2 tasks completed</strong>'],
  ])('renders the %s heading correctly for count %i', (eventType, count, expected) => {
    const email = renderGroupedEmail({
      totalEventCount: count,
      sections: [section({ eventType, count, taskNames: ['Task A'] })],
    })

    expect(email.htmlBody).toContain(expected)
  })

  it('truncates task titles longer than 100 characters', () => {
    const longTitle = 'A'.repeat(105)
    const email = renderGroupedEmail({
      totalEventCount: 1,
      sections: [section({ taskNames: [longTitle] })],
    })
    expect(email.htmlBody).toContain('A'.repeat(100) + '…')
    expect(email.htmlBody).not.toContain('A'.repeat(101))
  })

  it('returns an empty body when there are no sections', () => {
    expect(renderGroupedEmail({ totalEventCount: 0, sections: [] }).htmlBody).toBe('')
  })
})
