import { GroupedEmailContent } from '@/app/api/notification/groupedEmail.composer'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { GroupedEmailEventType } from '@prisma/client'
import { sendGroupedEmail } from './send-grouped-email'

const content: GroupedEmailContent = {
  totalEventCount: 2,
  sections: [
    {
      eventType: GroupedEmailEventType.ASSIGNED,
      count: 2,
      taskNames: ['Task A', 'Task B'],
      overflowCount: 0,
    },
  ],
}

const buildCopilotMock = (createNotification: jest.Mock) => ({ createNotification }) as unknown as CopilotAPI

describe('sendGroupedEmail', () => {
  it('returns the Copilot notification id', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_1', createdAt: '2026-06-09T00:00:00Z' })

    const id = await sendGroupedEmail({
      content,
      senderId: 'iu_1',
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      copilot: buildCopilotMock(createNotification),
    })

    expect(id).toBe('notif_1')
  })

  it('builds an email-only payload (no inProduct, IU sender, client recipient)', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_1', createdAt: '2026-06-09T00:00:00Z' })

    await sendGroupedEmail({
      content,
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
    expect(payload.deliveryTargets.email).toEqual({
      subject: 'You have 2 new task updates',
      header: 'Catch up on task activity',
      title: 'View all tasks',
      htmlBody: expect.stringContaining('2 tasks assigned to you'),
    })
    expect(payload.deliveryTargets.inProduct).toBeUndefined()
  })

  it('omits recipientCompanyId when null', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_2', createdAt: '2026-06-09T00:00:00Z' })

    await sendGroupedEmail({
      content,
      senderId: 'iu_1',
      recipientClientId: 'client_1',
      recipientCompanyId: null,
      copilot: buildCopilotMock(createNotification),
    })

    expect(createNotification.mock.calls[0][0].recipientCompanyId).toBeUndefined()
  })

  it('propagates errors from Copilot', async () => {
    const createNotification = jest.fn().mockRejectedValue(new Error('copilot 5xx'))

    await expect(
      sendGroupedEmail({
        content,
        senderId: 'iu_1',
        recipientClientId: 'client_1',
        recipientCompanyId: 'company_1',
        copilot: buildCopilotMock(createNotification),
      }),
    ).rejects.toThrow('copilot 5xx')
  })

  it('honors an explicit client sender type and company (client actor completing their own task)', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_3', createdAt: '2026-06-09T00:00:00Z' })

    await sendGroupedEmail({
      content,
      senderId: 'client_actor',
      senderType: 'client',
      senderCompanyId: 'company_1',
      recipientInternalUserId: 'iu_1',
      copilot: buildCopilotMock(createNotification),
    })

    expect(createNotification.mock.calls[0][0]).toMatchObject({
      senderId: 'client_actor',
      senderType: 'client',
      senderCompanyId: 'company_1',
      recipientInternalUserId: 'iu_1',
    })
  })

  it('forwards notificationSettingId so the platform can suppress per the IU preference', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_5', createdAt: '2026-06-09T00:00:00Z' })

    await sendGroupedEmail({
      content,
      senderId: 'iu_1',
      recipientInternalUserId: 'iu_2',
      notificationSettingId: 'setting_tasks',
      copilot: buildCopilotMock(createNotification),
    })

    expect(createNotification.mock.calls[0][0].notificationSettingId).toBe('setting_tasks')
  })

  it('retries without senderCompanyId when Copilot rejects it (single-company workspace)', async () => {
    const createNotification = jest
      .fn()
      .mockRejectedValueOnce({ message: 'invalid', body: { message: 'sender company ID is invalid based on sender' } })
      .mockResolvedValueOnce({ id: 'notif_4', createdAt: '2026-06-09T00:00:00Z' })

    const id = await sendGroupedEmail({
      content,
      senderId: 'client_actor',
      senderType: 'client',
      senderCompanyId: 'company_1',
      recipientInternalUserId: 'iu_1',
      copilot: buildCopilotMock(createNotification),
    })

    expect(id).toBe('notif_4')
    expect(createNotification).toHaveBeenCalledTimes(2)
    expect(createNotification.mock.calls[1][0].senderCompanyId).toBeUndefined()
  })
})
