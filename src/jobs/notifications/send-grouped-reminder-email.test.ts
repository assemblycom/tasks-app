import { CopilotAPI } from '@/utils/CopilotAPI'
import { TaskReminderType } from '@prisma/client'
import { sendGroupedReminderEmail } from './send-grouped-reminder-email'

const entries = [
  { taskTitle: 'Task A', reminderType: TaskReminderType.DUE_DATE_TODAY },
  { taskTitle: 'Task B', reminderType: TaskReminderType.NO_DUE_DATE_3D },
]

const buildCopilotMock = (createNotification: jest.Mock, getClient = jest.fn()) =>
  ({ createNotification, getClient }) as unknown as CopilotAPI

describe('sendGroupedReminderEmail', () => {
  it('builds an email-only payload with a resolved client company', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_1', createdAt: '2026-06-09T00:00:00Z' })

    const id = await sendGroupedReminderEmail({
      entries,
      senderId: 'iu_1',
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      copilot: buildCopilotMock(createNotification),
    })

    expect(id).toBe('notif_1')
    expect(createNotification).toHaveBeenCalledTimes(1)
    expect(createNotification.mock.calls[0][0]).toMatchObject({
      senderId: 'iu_1',
      senderType: 'internalUser',
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      deliveryTargets: {
        email: {
          subject: '[Reminder] You have 2 tasks to complete',
          header: 'Tasks that need your attention',
          title: 'View all tasks',
          htmlBody: expect.stringContaining('Due soon'),
        },
      },
    })
    expect(createNotification.mock.calls[0][0].deliveryTargets.inProduct).toBeUndefined()
  })

  it('looks up the client company when the caller has no company id', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_2', createdAt: '2026-06-09T00:00:00Z' })
    const getClient = jest.fn().mockResolvedValue({ companyId: 'company_resolved' })

    await sendGroupedReminderEmail({
      entries,
      senderId: 'iu_1',
      recipientClientId: 'client_1',
      recipientCompanyId: null,
      copilot: buildCopilotMock(createNotification, getClient),
    })

    expect(getClient).toHaveBeenCalledWith('client_1')
    expect(createNotification.mock.calls[0][0].recipientCompanyId).toBe('company_resolved')
  })
})
