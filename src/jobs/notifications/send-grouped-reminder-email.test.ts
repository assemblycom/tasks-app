import { CopilotAPI } from '@/utils/CopilotAPI'
import { TaskReminderType } from '@prisma/client'

const mockLoggerWarn = jest.fn()

jest.mock('@trigger.dev/sdk/v3', () => ({
  logger: { warn: (...args: unknown[]) => mockLoggerWarn(...args) },
}))

import { sendGroupedReminderEmail } from './send-grouped-reminder-email'

const buildCopilotMock = (createNotification: jest.Mock) => ({ createNotification }) as unknown as CopilotAPI

const entries = [
  { taskTitle: 'Submit timesheet', reminderType: TaskReminderType.NO_DUE_DATE_3D },
  { taskTitle: 'Review docs', reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D },
]

describe('sendGroupedReminderEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the Copilot notification id', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_1', createdAt: '2026-05-25T00:00:00Z' })

    const id = await sendGroupedReminderEmail({
      entries,
      senderId: 'iu_1',
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      copilot: buildCopilotMock(createNotification),
    })

    expect(id).toBe('notif_1')
  })

  it('builds an email-only payload for grouped reminders', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_1', createdAt: '2026-05-25T00:00:00Z' })

    await sendGroupedReminderEmail({
      entries,
      senderId: 'iu_1',
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      copilot: buildCopilotMock(createNotification),
    })

    expect(createNotification).toHaveBeenCalledTimes(1)
    const payload = createNotification.mock.calls[0][0]
    expect(payload).toMatchObject({
      senderId: 'iu_1',
      senderType: 'internalUser',
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
    })
    expect(payload.notificationSettingId).toBeUndefined()
    expect(payload.deliveryTargets.inProduct).toBeUndefined()
    expect(payload.deliveryTargets.email.subject).toBe('[Reminder] You have 2 tasks to complete')
  })

  it('returns null and logs when Copilot suppresses the notification', async () => {
    const createNotification = jest.fn().mockResolvedValue(null)

    const id = await sendGroupedReminderEmail({
      entries,
      senderId: 'iu_1',
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      copilot: buildCopilotMock(createNotification),
    })

    expect(id).toBeNull()
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'sendGroupedReminderEmail: notification suppressed by platform; keeping ledger for dedupe',
      expect.objectContaining({
        recipientClientId: 'client_1',
        recipientCompanyId: 'company_1',
        entryCount: 2,
      }),
    )
  })

  it('propagates errors from Copilot', async () => {
    const createNotification = jest.fn().mockRejectedValue(new Error('copilot 5xx'))

    await expect(
      sendGroupedReminderEmail({
        entries,
        senderId: 'iu_1',
        recipientClientId: 'client_1',
        recipientCompanyId: 'company_1',
        copilot: buildCopilotMock(createNotification),
      }),
    ).rejects.toThrow('copilot 5xx')
  })
})
