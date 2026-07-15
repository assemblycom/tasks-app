import { TaskReminderType } from '@prisma/client'

const mockSendGroupedReminderEmail = jest.fn()
const mockExecuteRaw = jest.fn()
const mockCopilotApiCtor = jest.fn()
const mockCaptureException = jest.fn()

jest.mock('@trigger.dev/sdk/v3', () => ({
  task: ({ run }: { run: (payload: unknown) => unknown }) => ({ run }),
  tasks: { onFailure: () => undefined },
  logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
}))

jest.mock('@/config', () => ({ copilotAPIKey: 'test-api-key' }))

jest.mock('@/jobs/sentry', () => ({
  Sentry: { captureException: (...args: unknown[]) => mockCaptureException(...args) },
}))

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      $executeRaw: mockExecuteRaw,
    }),
  },
}))

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation((...args: unknown[]) => {
    mockCopilotApiCtor(...args)
    return {}
  }),
}))

jest.mock('./send-grouped-reminder-email', () => ({
  sendGroupedReminderEmail: (...args: unknown[]) => mockSendGroupedReminderEmail(...args),
}))

import { DispatchGroupedReminderEmailPayload, dispatchGroupedReminderEmailRun } from './dispatch-grouped-reminder-email'

const payload: DispatchGroupedReminderEmailPayload = {
  ledgerIds: ['ledger_1', 'ledger_2'],
  workspaceId: 'ws_1',
  tasks: [
    { taskTitle: 'Submit timesheet', reminderType: TaskReminderType.NO_DUE_DATE_3D },
    { taskTitle: 'Review contract', reminderType: TaskReminderType.DUE_DATE_TODAY },
  ],
  recipientClientId: 'client_1',
  recipientCompanyId: 'company_1',
  senderId: 'iu_1',
}

describe('dispatchGroupedReminderEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSendGroupedReminderEmail.mockReset()
  })

  it('returns the created notification id', async () => {
    mockSendGroupedReminderEmail.mockResolvedValueOnce('notif_1')

    const result = await dispatchGroupedReminderEmailRun(payload)

    expect(mockCopilotApiCtor).toHaveBeenCalledWith('', 'ws_1/test-api-key')
    expect(result).toEqual({ ledgerIds: ['ledger_1', 'ledger_2'], notificationId: 'notif_1', sent: true })
  })

  it('treats a missing Copilot notification as a terminal no-op', async () => {
    mockSendGroupedReminderEmail.mockResolvedValueOnce(null)

    const result = await dispatchGroupedReminderEmailRun(payload)

    expect(result).toEqual({ ledgerIds: ['ledger_1', 'ledger_2'], notificationId: null, sent: false })
    expect(mockExecuteRaw).not.toHaveBeenCalled()
    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('rethrows so Trigger.dev can apply its retry policy', async () => {
    mockSendGroupedReminderEmail.mockRejectedValueOnce(new Error('copilot 5xx'))

    await expect(dispatchGroupedReminderEmailRun(payload)).rejects.toThrow('copilot 5xx')
    expect(mockExecuteRaw).not.toHaveBeenCalled()
    expect(mockCaptureException).not.toHaveBeenCalled()
  })
})
