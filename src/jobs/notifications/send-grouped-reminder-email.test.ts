import { CopilotAPI } from '@/utils/CopilotAPI'
import { TaskReminderType } from '@prisma/client'

import { sendGroupedReminderEmail } from './send-grouped-reminder-email'

const buildCopilotMock = (createNotification: jest.Mock) => ({ createNotification }) as unknown as CopilotAPI

const args = {
  entries: [{ taskTitle: 'Submit timesheet', reminderType: TaskReminderType.NO_DUE_DATE_3D }],
  senderId: 'iu_1',
  recipientClientId: 'client_1',
  recipientCompanyId: 'company_1',
}

describe('sendGroupedReminderEmail', () => {
  it('returns the Copilot notification id', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_1' })

    const id = await sendGroupedReminderEmail({
      ...args,
      copilot: buildCopilotMock(createNotification),
    })

    expect(id).toBe('notif_1')
  })

  it('returns null when Copilot does not create a notification', async () => {
    const createNotification = jest.fn().mockResolvedValue(null)

    const id = await sendGroupedReminderEmail({
      ...args,
      copilot: buildCopilotMock(createNotification),
    })

    expect(id).toBeNull()
  })

  it('propagates errors from Copilot', async () => {
    const createNotification = jest.fn().mockRejectedValue(new Error('copilot 5xx'))

    await expect(
      sendGroupedReminderEmail({
        ...args,
        copilot: buildCopilotMock(createNotification),
      }),
    ).rejects.toThrow('copilot 5xx')
  })
})
