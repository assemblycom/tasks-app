import { AssigneeType, TaskReminderType } from '@prisma/client'

// Mocks must be configured before requiring the SUT. Variables referenced inside the
// jest.mock factory must start with `mock` so the babel-jest allow-list lets the closure
// see them once the const declarations have run.
const mockQueryRaw = jest.fn()
const mockTaskFindMany = jest.fn()
const mockTaskReminderSentDelete = jest.fn()

const mockGetEligibleReminders = jest.fn()
const mockSendReminderEmail = jest.fn()

const mockGetWorkspace = jest.fn()
const mockGetCompanyClients = jest.fn()
const mockCopilotApiCtor = jest.fn()

jest.mock('@trigger.dev/sdk/v3', () => ({
  schedules: {
    task: ({ run }: { run: (payload: unknown, ctx?: unknown) => unknown }) => ({ run }),
  },
  logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
}))

jest.mock('@/config', () => ({
  copilotAPIKey: 'test-api-key',
}))

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      $queryRaw: mockQueryRaw,
      task: { findMany: mockTaskFindMany },
      taskReminderSent: { delete: mockTaskReminderSentDelete },
    }),
  },
}))

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation((...args: unknown[]) => {
    mockCopilotApiCtor(...args)
    return {
      getWorkspace: mockGetWorkspace,
      getCompanyClients: mockGetCompanyClients,
    }
  }),
}))

jest.mock('./eligibility', () => ({
  getEligibleReminders: (...args: unknown[]) => mockGetEligibleReminders(...args),
}))

jest.mock('./send-reminder-email', () => ({
  sendReminderEmail: (...args: unknown[]) => mockSendReminderEmail(...args),
}))

// Bypass Bottleneck's rate-limiting in tests but preserve sequential ordering per instance
// via a promise chain. Matches the pattern used in auto-archive-completed-tasks.test.ts so
// FIFO mockResolvedValueOnce queues drain deterministically.
jest.mock('bottleneck', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => {
    let chain: Promise<unknown> = Promise.resolve()
    return {
      schedule: <T>(fn: () => Promise<T>) => {
        const next = chain.then(() => fn())
        chain = next.catch(() => undefined)
        return next
      },
    }
  }),
}))

import { sendTaskReminders } from './send-task-reminders'

type RunResult = { sent: number; failed: number; skipped: number; workspaceCount: number }
const runJob = async (): Promise<RunResult> => {
  const { run } = sendTaskReminders as unknown as {
    run: (payload: { timestamp: Date }) => Promise<RunResult>
  }
  return run({ timestamp: new Date() })
}

const workspace = { id: 'ws_1', brandName: 'Acme' }

const buildRow = (overrides: Partial<Parameters<typeof Object.assign>[1]> = {}) => ({
  taskId: 'task_1',
  workspaceId: 'ws_1',
  assigneeId: 'client_1',
  assigneeType: AssigneeType.client,
  companyId: 'company_1',
  reminderType: TaskReminderType.NO_DUE_DATE_3D,
  ...overrides,
})

describe('sendTaskReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockQueryRaw.mockReset()
    mockTaskFindMany.mockReset()
    mockTaskReminderSentDelete.mockReset()
    mockGetEligibleReminders.mockReset()
    mockSendReminderEmail.mockReset()
    mockGetWorkspace.mockReset()
    mockGetCompanyClients.mockReset()
    mockCopilotApiCtor.mockReset()
    mockGetWorkspace.mockResolvedValue(workspace)
  })

  it('exits cleanly when no rows are eligible', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([])

    const result = await runJob()

    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0, workspaceCount: 0 })
    expect(mockQueryRaw).not.toHaveBeenCalled()
    expect(mockSendReminderEmail).not.toHaveBeenCalled()
    expect(mockCopilotApiCtor).not.toHaveBeenCalled()
  })

  it('filters out internalUser rows before any DB or Copilot work', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([
      buildRow({ assigneeType: AssigneeType.internalUser, assigneeId: 'iu_1', companyId: null }),
    ])

    const result = await runJob()

    expect(result.workspaceCount).toBe(0)
    expect(mockTaskFindMany).not.toHaveBeenCalled()
    expect(mockQueryRaw).not.toHaveBeenCalled()
    expect(mockSendReminderEmail).not.toHaveBeenCalled()
  })

  it('sends one reminder for a client-assigned task and writes one ledger row', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([buildRow()])
    mockTaskFindMany.mockResolvedValueOnce([{ id: 'task_1', title: 'Submit timesheet', createdById: 'iu_1' }])
    mockQueryRaw.mockResolvedValueOnce([
      {
        id: 'ledger_1',
        taskId: 'task_1',
        recipientId: 'client_1',
        reminderType: TaskReminderType.NO_DUE_DATE_3D,
      },
    ])
    mockSendReminderEmail.mockResolvedValueOnce('notif_1')

    const result = await runJob()

    expect(result).toEqual({ sent: 1, failed: 0, skipped: 0, workspaceCount: 1 })
    expect(mockSendReminderEmail).toHaveBeenCalledTimes(1)
    expect(mockSendReminderEmail.mock.calls[0][0]).toMatchObject({
      task: { id: 'task_1', title: 'Submit timesheet', createdById: 'iu_1' },
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      reminderType: TaskReminderType.NO_DUE_DATE_3D,
      isCompanyRecipient: false,
      workspace,
    })
  })

  it('initializes CopilotAPI with a workspace-scoped apiKey (no user token mint)', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([buildRow()])
    mockTaskFindMany.mockResolvedValueOnce([{ id: 'task_1', title: 'Submit timesheet', createdById: 'iu_1' }])
    mockQueryRaw.mockResolvedValueOnce([
      {
        id: 'ledger_1',
        taskId: 'task_1',
        recipientId: 'client_1',
        reminderType: TaskReminderType.NO_DUE_DATE_3D,
      },
    ])
    mockSendReminderEmail.mockResolvedValueOnce('notif_1')

    await runJob()

    expect(mockCopilotApiCtor).toHaveBeenCalledWith('', 'ws_1/test-api-key')
  })

  it('treats ON CONFLICT returning zero rows as fully-skipped (re-run idempotency)', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([buildRow()])
    mockTaskFindMany.mockResolvedValueOnce([{ id: 'task_1', title: 'Submit timesheet', createdById: 'iu_1' }])
    mockQueryRaw.mockResolvedValueOnce([])

    const result = await runJob()

    expect(result).toEqual({ sent: 0, failed: 0, skipped: 1, workspaceCount: 1 })
    expect(mockSendReminderEmail).not.toHaveBeenCalled()
  })

  it('fans out a company-assigned task to one send per current member', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([
      buildRow({
        assigneeType: AssigneeType.company,
        assigneeId: 'company_1',
        companyId: 'company_1',
      }),
    ])
    mockTaskFindMany.mockResolvedValueOnce([{ id: 'task_1', title: 'Submit timesheet', createdById: 'iu_1' }])
    mockGetCompanyClients.mockResolvedValueOnce([{ id: 'm_1' }, { id: 'm_2' }, { id: 'm_3' }])
    mockQueryRaw.mockResolvedValueOnce([
      { id: 'l_1', taskId: 'task_1', recipientId: 'm_1', reminderType: TaskReminderType.NO_DUE_DATE_3D },
      { id: 'l_2', taskId: 'task_1', recipientId: 'm_2', reminderType: TaskReminderType.NO_DUE_DATE_3D },
      { id: 'l_3', taskId: 'task_1', recipientId: 'm_3', reminderType: TaskReminderType.NO_DUE_DATE_3D },
    ])
    mockSendReminderEmail.mockResolvedValue('notif')

    const result = await runJob()

    expect(result).toEqual({ sent: 3, failed: 0, skipped: 0, workspaceCount: 1 })
    expect(mockSendReminderEmail).toHaveBeenCalledTimes(3)
    const recipientIds = mockSendReminderEmail.mock.calls.map((c) => c[0].recipientClientId).sort()
    expect(recipientIds).toEqual(['m_1', 'm_2', 'm_3'])
    expect(mockSendReminderEmail.mock.calls[0][0].isCompanyRecipient).toBe(true)
  })

  it('compensates the ledger when Copilot send fails', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([buildRow()])
    mockTaskFindMany.mockResolvedValueOnce([{ id: 'task_1', title: 'Submit timesheet', createdById: 'iu_1' }])
    mockQueryRaw.mockResolvedValueOnce([
      { id: 'ledger_1', taskId: 'task_1', recipientId: 'client_1', reminderType: TaskReminderType.NO_DUE_DATE_3D },
    ])
    mockSendReminderEmail.mockRejectedValueOnce(new Error('copilot 5xx'))
    mockTaskReminderSentDelete.mockResolvedValueOnce({ id: 'ledger_1' })

    const result = await runJob()

    expect(result).toEqual({ sent: 0, failed: 1, skipped: 0, workspaceCount: 1 })
    expect(mockTaskReminderSentDelete).toHaveBeenCalledWith({ where: { id: 'ledger_1' } })
  })

  it('does not abort the sweep when one workspace throws (per-workspace isolation)', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([
      buildRow({ workspaceId: 'ws_bad', taskId: 'task_bad' }),
      buildRow({ workspaceId: 'ws_good', taskId: 'task_good', assigneeId: 'client_good' }),
    ])
    // ws_bad findMany throws; ws_good completes a single send.
    mockTaskFindMany
      .mockRejectedValueOnce(new Error('db blew up'))
      .mockResolvedValueOnce([{ id: 'task_good', title: 'Submit timesheet', createdById: 'iu_good' }])
    mockQueryRaw.mockResolvedValueOnce([
      {
        id: 'ledger_g',
        taskId: 'task_good',
        recipientId: 'client_good',
        reminderType: TaskReminderType.NO_DUE_DATE_3D,
      },
    ])
    mockSendReminderEmail.mockResolvedValueOnce('notif_good')

    const result = await runJob()

    expect(result.workspaceCount).toBe(2)
    expect(result.sent).toBe(1)
  })
})
