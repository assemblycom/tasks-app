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

import {
  DispatchGroupedReminderEmailPayload,
  dispatchGroupedReminderEmailOnFailure,
  dispatchGroupedReminderEmailRun,
} from './dispatch-grouped-reminder-email'

const buildPayload = (overrides: Partial<DispatchGroupedReminderEmailPayload> = {}): DispatchGroupedReminderEmailPayload => ({
  ledgerIds: ['ledger_1', 'ledger_2'],
  workspaceId: 'ws_1',
  tasks: [
    { taskTitle: 'Submit timesheet', reminderType: TaskReminderType.NO_DUE_DATE_3D },
    { taskTitle: 'Review docs', reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D },
  ],
  recipientClientId: 'client_1',
  recipientCompanyId: 'company_1',
  senderId: 'iu_1',
  ...overrides,
})

describe('dispatchGroupedReminderEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSendGroupedReminderEmail.mockReset()
    mockExecuteRaw.mockReset()
    mockCopilotApiCtor.mockReset()
    mockCaptureException.mockReset()
  })

  describe('run', () => {
    it('mints a workspace-scoped CopilotAPI and forwards the payload to sendGroupedReminderEmail', async () => {
      mockSendGroupedReminderEmail.mockResolvedValueOnce('notif_1')

      const result = await dispatchGroupedReminderEmailRun(buildPayload())

      expect(mockCopilotApiCtor).toHaveBeenCalledWith('', 'ws_1/test-api-key')
      expect(mockSendGroupedReminderEmail).toHaveBeenCalledTimes(1)
      expect(result).toEqual({
        ledgerIds: ['ledger_1', 'ledger_2'],
        notificationId: 'notif_1',
        sent: true,
        suppressed: false,
      })
    })

    it('succeeds without retry when the platform suppresses the notification', async () => {
      mockSendGroupedReminderEmail.mockResolvedValueOnce(null)

      const result = await dispatchGroupedReminderEmailRun(buildPayload())

      expect(result).toEqual({
        ledgerIds: ['ledger_1', 'ledger_2'],
        notificationId: null,
        sent: false,
        suppressed: true,
      })
      expect(mockExecuteRaw).not.toHaveBeenCalled()
      expect(mockCaptureException).not.toHaveBeenCalled()
    })

    it('rethrows so Trigger.dev can apply its retry policy for real failures', async () => {
      mockSendGroupedReminderEmail.mockRejectedValueOnce(new Error('copilot 5xx'))

      await expect(dispatchGroupedReminderEmailRun(buildPayload())).rejects.toThrow('copilot 5xx')
      expect(mockExecuteRaw).not.toHaveBeenCalled()
    })
  })

  describe('onFailure', () => {
    it('hard-deletes ledger rows so the next cron run can retry after terminal failures', async () => {
      mockExecuteRaw.mockResolvedValueOnce(2)

      await dispatchGroupedReminderEmailOnFailure({
        payload: buildPayload(),
        error: new Error('all retries exhausted'),
      })

      expect(mockExecuteRaw).toHaveBeenCalledTimes(1)
      expect(mockExecuteRaw.mock.calls[0][1]).toEqual(['ledger_1', 'ledger_2'])
    })
  })
})
