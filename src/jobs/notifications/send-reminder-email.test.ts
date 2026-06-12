import { WorkspaceResponse } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { TaskReminderType } from '@prisma/client'
import { sendReminderEmail } from './send-reminder-email'

const workspace: WorkspaceResponse = {
  id: 'ws_1',
  brandName: 'Acme',
  labels: {
    individualTerm: 'client',
    individualTermPlural: 'clients',
    groupTerm: 'company',
    groupTermPlural: 'companies',
  },
}

const task = { id: 'task_1', title: 'Submit timesheet', createdById: 'iu_1' }

const buildCopilotMock = (createNotificationOptionalResponse: jest.Mock) =>
  ({ createNotificationOptionalResponse }) as unknown as CopilotAPI

describe('sendReminderEmail', () => {
  it('returns the Copilot notification id', async () => {
    const createNotificationOptionalResponse = jest
      .fn()
      .mockResolvedValue({ id: 'notif_1', createdAt: '2026-05-25T00:00:00Z' })

    const id = await sendReminderEmail({
      task,
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      reminderType: TaskReminderType.NO_DUE_DATE_3D,
      isCompanyRecipient: false,
      workspace,
      copilot: buildCopilotMock(createNotificationOptionalResponse),
    })

    expect(id).toBe('notif_1')
  })

  it('treats an empty successful Copilot response as sent', async () => {
    const createNotificationOptionalResponse = jest.fn().mockResolvedValue(null)

    const id = await sendReminderEmail({
      task,
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      reminderType: TaskReminderType.NO_DUE_DATE_3D,
      isCompanyRecipient: false,
      workspace,
      copilot: buildCopilotMock(createNotificationOptionalResponse),
    })

    expect(id).toBeUndefined()
  })

  it('builds an email-only payload (no inProduct, IU sender, client recipient)', async () => {
    const createNotificationOptionalResponse = jest
      .fn()
      .mockResolvedValue({ id: 'notif_1', createdAt: '2026-05-25T00:00:00Z' })

    await sendReminderEmail({
      task,
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      reminderType: TaskReminderType.NO_DUE_DATE_3D,
      isCompanyRecipient: false,
      workspace,
      copilot: buildCopilotMock(createNotificationOptionalResponse),
    })

    expect(createNotificationOptionalResponse).toHaveBeenCalledTimes(1)
    const payload = createNotificationOptionalResponse.mock.calls[0][0]
    expect(payload).toMatchObject({
      senderId: 'iu_1',
      senderType: 'internalUser',
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
    })
    expect(payload.deliveryTargets.email).toEqual({
      subject: '[Reminder] You have a task to complete',
      header: 'A task was assigned to you',
      title: 'View task',
      body: expect.stringContaining('‘Submit timesheet’'),
    })
    expect(payload.deliveryTargets.inProduct).toBeUndefined()
  })

  it('uses the company-recipient header when isCompanyRecipient=true', async () => {
    const createNotificationOptionalResponse = jest
      .fn()
      .mockResolvedValue({ id: 'notif_2', createdAt: '2026-05-25T00:00:00Z' })

    await sendReminderEmail({
      task,
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      reminderType: TaskReminderType.DUE_DATE_TODAY,
      isCompanyRecipient: true,
      workspace,
      copilot: buildCopilotMock(createNotificationOptionalResponse),
    })

    const payload = createNotificationOptionalResponse.mock.calls[0][0]
    expect(payload.deliveryTargets.email.header).toBe('A task was assigned to your company')
    expect(payload.deliveryTargets.email.subject).toBe('[Due Soon] Task due today')
  })

  it('omits recipientCompanyId when null', async () => {
    const createNotificationOptionalResponse = jest
      .fn()
      .mockResolvedValue({ id: 'notif_3', createdAt: '2026-05-25T00:00:00Z' })

    await sendReminderEmail({
      task,
      recipientClientId: 'client_1',
      recipientCompanyId: null,
      reminderType: TaskReminderType.NO_DUE_DATE_3D,
      isCompanyRecipient: false,
      workspace,
      copilot: buildCopilotMock(createNotificationOptionalResponse),
    })

    const payload = createNotificationOptionalResponse.mock.calls[0][0]
    expect(payload.recipientCompanyId).toBeUndefined()
  })

  it('propagates errors from Copilot (no ledger compensation here)', async () => {
    const createNotificationOptionalResponse = jest.fn().mockRejectedValue(new Error('copilot 5xx'))

    await expect(
      sendReminderEmail({
        task,
        recipientClientId: 'client_1',
        recipientCompanyId: 'company_1',
        reminderType: TaskReminderType.NO_DUE_DATE_3D,
        isCompanyRecipient: false,
        workspace,
        copilot: buildCopilotMock(createNotificationOptionalResponse),
      }),
    ).rejects.toThrow('copilot 5xx')
  })
})
