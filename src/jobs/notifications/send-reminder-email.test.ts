import { WorkspaceResponse } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { TaskReminderType } from '@prisma/client'
import { sendReminderEmail } from './send-reminder-email'

jest.mock('@/config', () => ({
  reminderSubjectOverrideWorkspaces: new Set(['ws_override']),
  reminderSubjectSearch: ': Acme Bank',
  reminderSubjectReplacement: ':',
}))

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

const buildCopilotMock = (createNotification: jest.Mock) => ({ createNotification }) as unknown as CopilotAPI

describe('sendReminderEmail', () => {
  it('returns the Copilot notification id', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_1', createdAt: '2026-05-25T00:00:00Z' })

    const id = await sendReminderEmail({
      task,
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      reminderType: TaskReminderType.NO_DUE_DATE_3D,
      isCompanyRecipient: false,
      workspace,
      copilot: buildCopilotMock(createNotification),
    })

    expect(id).toBe('notif_1')
  })

  it('builds an email-only payload (no inProduct, IU sender, client recipient)', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_1', createdAt: '2026-05-25T00:00:00Z' })

    await sendReminderEmail({
      task,
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      reminderType: TaskReminderType.NO_DUE_DATE_3D,
      isCompanyRecipient: false,
      workspace,
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
      subject: '[Reminder] You have a task to complete',
      header: 'A task was assigned to you',
      title: 'View task',
      body: expect.stringContaining('‘Submit timesheet’'),
    })
    expect(payload.deliveryTargets.inProduct).toBeUndefined()
  })

  it('uses the company-recipient header when isCompanyRecipient=true', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_2', createdAt: '2026-05-25T00:00:00Z' })

    await sendReminderEmail({
      task,
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      reminderType: TaskReminderType.DUE_DATE_TODAY,
      isCompanyRecipient: true,
      workspace,
      copilot: buildCopilotMock(createNotification),
    })

    const payload = createNotification.mock.calls[0][0]
    expect(payload.deliveryTargets.email.header).toBe('A task was assigned to your company')
    expect(payload.deliveryTargets.email.subject).toBe('[Due Soon] Task due today')
  })

  it('omits recipientCompanyId when null', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_3', createdAt: '2026-05-25T00:00:00Z' })

    await sendReminderEmail({
      task,
      recipientClientId: 'client_1',
      recipientCompanyId: null,
      reminderType: TaskReminderType.NO_DUE_DATE_3D,
      isCompanyRecipient: false,
      workspace,
      copilot: buildCopilotMock(createNotification),
    })

    const payload = createNotification.mock.calls[0][0]
    expect(payload.recipientCompanyId).toBeUndefined()
  })

  it('propagates errors from Copilot (no ledger compensation here)', async () => {
    const createNotification = jest.fn().mockRejectedValue(new Error('copilot 5xx'))

    await expect(
      sendReminderEmail({
        task,
        recipientClientId: 'client_1',
        recipientCompanyId: 'company_1',
        reminderType: TaskReminderType.NO_DUE_DATE_3D,
        isCompanyRecipient: false,
        workspace,
        copilot: buildCopilotMock(createNotification),
      }),
    ).rejects.toThrow('copilot 5xx')
  })

  it('uses the task title with the escalating tag as subject for override workspaces', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_4', createdAt: '2026-05-25T00:00:00Z' })

    await sendReminderEmail({
      task,
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D,
      isCompanyRecipient: false,
      workspace: { ...workspace, id: 'ws_override' },
      copilot: buildCopilotMock(createNotification),
    })

    const payload = createNotification.mock.calls[0][0]
    expect(payload.deliveryTargets.email.subject).toBe('[Overdue] Submit timesheet')
    // Only the subject is customized — the rest of the reminder copy is unchanged.
    expect(payload.deliveryTargets.email.header).toBe('A task was assigned to you')
    expect(payload.deliveryTargets.email.title).toBe('View task')
  })

  it('strips the configured search phrase from the subject for override workspaces', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_6', createdAt: '2026-05-25T00:00:00Z' })

    await sendReminderEmail({
      task: { ...task, title: 'Quarterly review: Acme Bank' },
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D,
      isCompanyRecipient: false,
      workspace: { ...workspace, id: 'ws_override' },
      copilot: buildCopilotMock(createNotification),
    })

    const payload = createNotification.mock.calls[0][0]
    expect(payload.deliveryTargets.email.subject).toBe('[Overdue] Quarterly review:')
  })

  it('normalizes and truncates long task-title subjects for override workspaces', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_7', createdAt: '2026-05-25T00:00:00Z' })

    await sendReminderEmail({
      task: {
        ...task,
        title: `Quarterly   review: Acme Bank ${'with extra compliance context '.repeat(5)}`,
      },
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D,
      isCompanyRecipient: false,
      workspace: { ...workspace, id: 'ws_override' },
      copilot: buildCopilotMock(createNotification),
    })

    const subject = createNotification.mock.calls[0][0].deliveryTargets.email.subject
    expect(subject).toHaveLength(120)
    expect(subject).toBe(
      '[Overdue] Quarterly review: with extra compliance context with extra compliance context with extra compliance context with...',
    )
  })

  it('falls back to the default subject when an override title becomes empty', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_8', createdAt: '2026-05-25T00:00:00Z' })

    await sendReminderEmail({
      task: { ...task, title: ': Acme Bank' },
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D,
      isCompanyRecipient: false,
      workspace: { ...workspace, id: 'ws_override' },
      copilot: buildCopilotMock(createNotification),
    })

    const payload = createNotification.mock.calls[0][0]
    expect(payload.deliveryTargets.email.subject).toBe('[Overdue] Task was due 3 days ago')
  })

  it('keeps the generic subject for workspaces not in the override set', async () => {
    const createNotification = jest.fn().mockResolvedValue({ id: 'notif_5', createdAt: '2026-05-25T00:00:00Z' })

    await sendReminderEmail({
      task,
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D,
      isCompanyRecipient: false,
      workspace,
      copilot: buildCopilotMock(createNotification),
    })

    const payload = createNotification.mock.calls[0][0]
    expect(payload.deliveryTargets.email.subject).toBe('[Overdue] Task was due 3 days ago')
  })
})
