import { TaskReminderType } from '@prisma/client'

const mockSendReminderEmail = jest.fn()
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
      // Compensation hard-deletes via $executeRaw to bypass the softDelete extension.
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

jest.mock('./send-reminder-email', () => ({
  sendReminderEmail: (...args: unknown[]) => mockSendReminderEmail(...args),
}))

import {
  DispatchReminderEmailPayload,
  dispatchReminderEmailOnFailure,
  dispatchReminderEmailRun,
} from './dispatch-reminder-email'

const buildPayload = (overrides: Partial<DispatchReminderEmailPayload> = {}): DispatchReminderEmailPayload => ({
  ledgerId: 'ledger_1',
  workspaceId: 'ws_1',
  task: { id: 'task_1', title: 'Submit timesheet', createdById: 'iu_1' },
  recipientClientId: 'client_1',
  recipientCompanyId: 'company_1',
  reminderType: TaskReminderType.NO_DUE_DATE_3D,
  isCompanyRecipient: false,
  workspace: { id: 'ws_1', brandName: 'Acme' },
  ...overrides,
})

describe('dispatchReminderEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSendReminderEmail.mockReset()
    mockExecuteRaw.mockReset()
    mockCopilotApiCtor.mockReset()
    mockCaptureException.mockReset()
  })

  describe('run', () => {
    it('mints a workspace-scoped CopilotAPI and forwards the payload to sendReminderEmail', async () => {
      mockSendReminderEmail.mockResolvedValueOnce('notif_1')

      const result = await dispatchReminderEmailRun(buildPayload())

      expect(mockCopilotApiCtor).toHaveBeenCalledWith('', 'ws_1/test-api-key')
      expect(mockSendReminderEmail).toHaveBeenCalledTimes(1)
      expect(mockSendReminderEmail.mock.calls[0][0]).toMatchObject({
        task: { id: 'task_1', title: 'Submit timesheet', createdById: 'iu_1' },
        recipientClientId: 'client_1',
        recipientCompanyId: 'company_1',
        reminderType: TaskReminderType.NO_DUE_DATE_3D,
        isCompanyRecipient: false,
      })
      expect(result).toEqual({ ledgerId: 'ledger_1', notificationId: 'notif_1', sent: true })
    })

    it('treats an email-only null notification response as a successful send', async () => {
      mockSendReminderEmail.mockResolvedValueOnce(null)

      const result = await dispatchReminderEmailRun(buildPayload())

      expect(result).toEqual({ ledgerId: 'ledger_1', notificationId: null, sent: true })
      expect(mockExecuteRaw).not.toHaveBeenCalled()
      expect(mockCaptureException).not.toHaveBeenCalled()
    })

    it('rethrows so Trigger.dev can apply its retry policy', async () => {
      mockSendReminderEmail.mockRejectedValueOnce(new Error('copilot 5xx'))

      await expect(dispatchReminderEmailRun(buildPayload())).rejects.toThrow('copilot 5xx')
      expect(mockExecuteRaw).not.toHaveBeenCalled() // compensation is onFailure's job, not run's
      expect(mockCaptureException).not.toHaveBeenCalled() // capture waits for retries to exhaust (onFailure)
    })
  })

  describe('onFailure', () => {
    it('hard-deletes the ledger row (raw SQL, bypassing softDelete) so the next cron run can retry', async () => {
      mockExecuteRaw.mockResolvedValueOnce(1)

      await dispatchReminderEmailOnFailure({
        payload: buildPayload(),
        error: new Error('all retries exhausted'),
      })

      expect(mockExecuteRaw).toHaveBeenCalledTimes(1)
      // $executeRaw is a tagged template: calls[0] = [stringsArray, ...boundValues].
      expect(mockExecuteRaw.mock.calls[0][1]).toBe('ledger_1')
    })

    it('captures the terminal failure to Sentry with task/recipient/reminder/workspace tags', async () => {
      mockExecuteRaw.mockResolvedValueOnce(1)
      const error = new Error('copilot 500 after retries')

      await dispatchReminderEmailOnFailure({ payload: buildPayload(), error })

      expect(mockCaptureException).toHaveBeenCalledWith(error, {
        tags: {
          job: 'dispatch-reminder-email',
          taskId: 'task_1',
          recipientId: 'client_1',
          reminderType: TaskReminderType.NO_DUE_DATE_3D,
          workspaceId: 'ws_1',
        },
      })
    })

    it('does not throw if the ledger DELETE itself fails (logs and moves on)', async () => {
      mockExecuteRaw.mockRejectedValueOnce(new Error('db blew up'))

      await expect(
        dispatchReminderEmailOnFailure({
          payload: buildPayload(),
          error: new Error('all retries exhausted'),
        }),
      ).resolves.toBeUndefined()
    })
  })
})
