import { AssigneeType, TaskReminderType } from '@prisma/client'

const mockTaskReminderSentCreateManyAndReturn = jest.fn()
const mockExecuteRaw = jest.fn()
const mockGetEligibleReminders = jest.fn()
const mockBatchTrigger = jest.fn()
const mockGroupedBatchTrigger = jest.fn()
const mockGetWorkspace = jest.fn()
const mockGetCompanyClients = jest.fn()
const mockCopilotApiCtor = jest.fn()
const mockCaptureException = jest.fn()

jest.mock('@trigger.dev/sdk/v3', () => ({
  schedules: {
    task: (config: { run: (payload: unknown, ctx?: unknown) => unknown; retry?: unknown }) => config,
  },
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
      taskReminderSent: {
        createManyAndReturn: mockTaskReminderSentCreateManyAndReturn,
      },
      // Compensation hard-deletes via $executeRaw to bypass the softDelete extension.
      $executeRaw: mockExecuteRaw,
    }),
  },
}))

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation((...args: unknown[]) => {
    mockCopilotApiCtor(...args)
    return { getWorkspace: mockGetWorkspace, getCompanyClients: mockGetCompanyClients }
  }),
}))

jest.mock('./eligibility', () => ({
  getEligibleReminders: (...args: unknown[]) => mockGetEligibleReminders(...args),
}))

jest.mock('./dispatch-reminder-email', () => ({
  dispatchReminderEmail: { batchTrigger: (...args: unknown[]) => mockBatchTrigger(...args) },
}))

jest.mock('./dispatch-grouped-reminder-email', () => ({
  dispatchGroupedReminderEmail: { batchTrigger: (...args: unknown[]) => mockGroupedBatchTrigger(...args) },
}))

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

type RunResult = { enqueued: number; skipped: number; workspaceCount: number }
type TriggerTaskConfig = {
  run: (payload: { timestamp: Date }) => Promise<RunResult>
  retry?: unknown
}
const runJob = async (): Promise<RunResult> => {
  const { run } = sendTaskReminders as unknown as TriggerTaskConfig
  return run({ timestamp: new Date() })
}

const workspace = { id: 'ws_1', brandName: 'Acme' }

const buildRow = (overrides: Partial<Parameters<typeof Object.assign>[1]> = {}) => ({
  taskId: 'task_1',
  workspaceId: 'ws_1',
  title: 'Submit timesheet',
  createdById: 'iu_1',
  assigneeId: 'client_1',
  assigneeType: AssigneeType.client,
  companyId: 'company_1',
  reminderType: TaskReminderType.NO_DUE_DATE_3D,
  ...overrides,
})

describe('sendTaskReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockTaskReminderSentCreateManyAndReturn.mockReset()
    mockExecuteRaw.mockReset()
    mockGetEligibleReminders.mockReset()
    mockBatchTrigger.mockReset()
    mockGetWorkspace.mockReset()
    mockGetCompanyClients.mockReset()
    mockCopilotApiCtor.mockReset()
    mockCaptureException.mockReset()
    mockGroupedBatchTrigger.mockReset()
    mockGetWorkspace.mockResolvedValue(workspace)
    mockBatchTrigger.mockResolvedValue({ batchId: 'b1' })
    mockGroupedBatchTrigger.mockResolvedValue({ batchId: 'b2' })
  })

  it('retries transient cron-level failures before marking the sweep failed', () => {
    const { retry } = sendTaskReminders as unknown as TriggerTaskConfig

    expect(retry).toEqual({
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 15_000,
      randomize: true,
    })
  })

  it('exits cleanly when no rows are eligible', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([])

    const result = await runJob()

    expect(result).toEqual({ enqueued: 0, skipped: 0, workspaceCount: 0 })
    expect(mockTaskReminderSentCreateManyAndReturn).not.toHaveBeenCalled()
    expect(mockBatchTrigger).not.toHaveBeenCalled()
    expect(mockCopilotApiCtor).not.toHaveBeenCalled()
  })

  it('filters out internalUser rows before any Copilot work', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([
      buildRow({ assigneeType: AssigneeType.internalUser, assigneeId: 'iu_1', companyId: null }),
    ])

    const result = await runJob()

    expect(result.workspaceCount).toBe(0)
    expect(mockBatchTrigger).not.toHaveBeenCalled()
  })

  it('enqueues one dispatch per net-new ledger row (client-assigned)', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([buildRow()])
    mockTaskReminderSentCreateManyAndReturn.mockResolvedValueOnce([
      { id: 'ledger_1', taskId: 'task_1', recipientId: 'client_1', reminderType: TaskReminderType.NO_DUE_DATE_3D },
    ])

    const result = await runJob()

    expect(result).toEqual({ enqueued: 1, skipped: 0, workspaceCount: 1 })
    expect(mockBatchTrigger).toHaveBeenCalledTimes(1)
    const batch = mockBatchTrigger.mock.calls[0][0]
    expect(batch).toHaveLength(1)
    expect(batch[0].payload).toMatchObject({
      ledgerId: 'ledger_1',
      workspaceId: 'ws_1',
      task: { id: 'task_1', title: 'Submit timesheet', createdById: 'iu_1' },
      recipientClientId: 'client_1',
      recipientCompanyId: 'company_1',
      reminderType: TaskReminderType.NO_DUE_DATE_3D,
      isCompanyRecipient: false,
      workspace,
    })
  })

  it('initializes CopilotAPI with a workspace-scoped apiKey', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([buildRow()])
    mockTaskReminderSentCreateManyAndReturn.mockResolvedValueOnce([
      { id: 'ledger_1', taskId: 'task_1', recipientId: 'client_1', reminderType: TaskReminderType.NO_DUE_DATE_3D },
    ])

    await runJob()

    expect(mockCopilotApiCtor).toHaveBeenCalledWith('', 'ws_1/test-api-key')
  })

  it('treats ON CONFLICT returning zero rows as fully-skipped (re-run idempotency)', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([buildRow()])
    mockTaskReminderSentCreateManyAndReturn.mockResolvedValueOnce([])

    const result = await runJob()

    expect(result).toEqual({ enqueued: 0, skipped: 1, workspaceCount: 1 })
    expect(mockBatchTrigger).not.toHaveBeenCalled()
    // ON CONFLICT dedupe is normal — it must never reach Sentry.
    expect(mockCaptureException).not.toHaveBeenCalled()
  })

  it('captures eligibility-query failures to Sentry and rethrows so the run fails', async () => {
    const boom = new Error('eligibility SQL blew up')
    mockGetEligibleReminders.mockRejectedValueOnce(boom)

    await expect(runJob()).rejects.toThrow('eligibility SQL blew up')
    expect(mockCaptureException).toHaveBeenCalledWith(boom, {
      tags: { job: 'send-task-reminders', phase: 'eligibility' },
    })
    expect(mockTaskReminderSentCreateManyAndReturn).not.toHaveBeenCalled()
  })

  it('fans out a company-assigned task to one dispatch per current member', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([
      buildRow({ assigneeType: AssigneeType.company, assigneeId: 'company_1', companyId: 'company_1' }),
    ])
    mockGetCompanyClients.mockResolvedValueOnce([{ id: 'm_1' }, { id: 'm_2' }, { id: 'm_3' }])
    mockTaskReminderSentCreateManyAndReturn.mockResolvedValueOnce([
      { id: 'l_1', taskId: 'task_1', recipientId: 'm_1', reminderType: TaskReminderType.NO_DUE_DATE_3D },
      { id: 'l_2', taskId: 'task_1', recipientId: 'm_2', reminderType: TaskReminderType.NO_DUE_DATE_3D },
      { id: 'l_3', taskId: 'task_1', recipientId: 'm_3', reminderType: TaskReminderType.NO_DUE_DATE_3D },
    ])

    const result = await runJob()

    expect(result).toEqual({ enqueued: 3, skipped: 0, workspaceCount: 1 })
    expect(mockBatchTrigger).toHaveBeenCalledTimes(1)
    const batch = mockBatchTrigger.mock.calls[0][0]
    expect(batch).toHaveLength(3)
    expect(batch.map((b: { payload: { recipientClientId: string } }) => b.payload.recipientClientId).sort()).toEqual([
      'm_1',
      'm_2',
      'm_3',
    ])
    expect(batch[0].payload.isCompanyRecipient).toBe(true)
  })

  it('chunks batchTrigger calls so a workspace with >500 fanned-out sends still enqueues', async () => {
    // One company task fanning out to 1200 members → 1200 dispatch payloads → 3 chunks of 500.
    const members = Array.from({ length: 1200 }, (_, i) => ({ id: `m_${i}` }))
    const ledgerRows = members.map((m, i) => ({
      id: `l_${i}`,
      taskId: 'task_1',
      recipientId: m.id,
      reminderType: TaskReminderType.NO_DUE_DATE_3D,
    }))
    mockGetEligibleReminders.mockResolvedValueOnce([
      buildRow({ assigneeType: AssigneeType.company, assigneeId: 'company_1', companyId: 'company_1' }),
    ])
    mockGetCompanyClients.mockResolvedValueOnce(members)
    mockTaskReminderSentCreateManyAndReturn.mockResolvedValueOnce(ledgerRows)

    const result = await runJob()

    expect(result).toEqual({ enqueued: 1200, skipped: 0, workspaceCount: 1 })
    expect(mockBatchTrigger).toHaveBeenCalledTimes(3)
    expect(mockBatchTrigger.mock.calls[0][0]).toHaveLength(500)
    expect(mockBatchTrigger.mock.calls[1][0]).toHaveLength(500)
    expect(mockBatchTrigger.mock.calls[2][0]).toHaveLength(200)
    expect(mockExecuteRaw).not.toHaveBeenCalled()
  })

  it('compensates the ledger when a batchTrigger chunk fails', async () => {
    const members = Array.from({ length: 800 }, (_, i) => ({ id: `m_${i}` }))
    const ledgerRows = members.map((m, i) => ({
      id: `l_${i}`,
      taskId: 'task_1',
      recipientId: m.id,
      reminderType: TaskReminderType.NO_DUE_DATE_3D,
    }))
    mockGetEligibleReminders.mockResolvedValueOnce([
      buildRow({ assigneeType: AssigneeType.company, assigneeId: 'company_1', companyId: 'company_1' }),
    ])
    mockGetCompanyClients.mockResolvedValueOnce(members)
    mockTaskReminderSentCreateManyAndReturn.mockResolvedValueOnce(ledgerRows)
    // First chunk (500) succeeds, second (300) fails.
    mockBatchTrigger.mockResolvedValueOnce({ batchId: 'b1' }).mockRejectedValueOnce(new Error('trigger.dev 5xx'))

    const result = await runJob()

    expect(result.enqueued).toBe(500)
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1)
    // $executeRaw is a tagged template: calls[0] = [stringsArray, ledgerIds] — the failed
    // chunk's 300 ids passed to the DELETE ... WHERE id = ANY($1) compensation.
    const ledgerIds = mockExecuteRaw.mock.calls[0][1] as string[]
    expect(ledgerIds).toHaveLength(300)
    expect(ledgerIds[0]).toBe('l_500')
    expect(ledgerIds[299]).toBe('l_799')
  })

  it('skips a single task whose getCompanyClients fails without dropping siblings', async () => {
    // Two company tasks in the same workspace. The first one's fan-out throws (Copilot
    // exhausted its own retries); the second one should still get its reminder enqueued.
    mockGetEligibleReminders.mockResolvedValueOnce([
      buildRow({
        taskId: 'task_bad',
        assigneeType: AssigneeType.company,
        assigneeId: 'company_bad',
        companyId: 'company_bad',
      }),
      buildRow({
        taskId: 'task_good',
        assigneeType: AssigneeType.company,
        assigneeId: 'company_good',
        companyId: 'company_good',
      }),
    ])
    mockGetCompanyClients
      .mockRejectedValueOnce(new Error('copilot 5xx'))
      .mockResolvedValueOnce([{ id: 'm_1' }, { id: 'm_2' }])
    mockTaskReminderSentCreateManyAndReturn.mockResolvedValueOnce([
      { id: 'l_1', taskId: 'task_good', recipientId: 'm_1', reminderType: TaskReminderType.NO_DUE_DATE_3D },
      { id: 'l_2', taskId: 'task_good', recipientId: 'm_2', reminderType: TaskReminderType.NO_DUE_DATE_3D },
    ])

    const result = await runJob()

    expect(result).toEqual({ enqueued: 2, skipped: 0, workspaceCount: 1 })
    expect(mockBatchTrigger).toHaveBeenCalledTimes(1)
    const batch = mockBatchTrigger.mock.calls[0][0]
    expect(batch.map((b: { payload: { recipientClientId: string } }) => b.payload.recipientClientId).sort()).toEqual([
      'm_1',
      'm_2',
    ])
  })

  it('sends one grouped email when a recipient has multiple reminders in the same batch', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([
      buildRow({ taskId: 'task_1', title: 'Upload W-9', reminderType: TaskReminderType.DUE_DATE_TODAY }),
      buildRow({ taskId: 'task_2', title: 'Review contract', reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D }),
    ])
    // Same recipient (client_1) for both tasks
    mockTaskReminderSentCreateManyAndReturn.mockResolvedValueOnce([
      { id: 'l_1', taskId: 'task_1', recipientId: 'client_1', reminderType: TaskReminderType.DUE_DATE_TODAY },
      { id: 'l_2', taskId: 'task_2', recipientId: 'client_1', reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D },
    ])

    const result = await runJob()

    // One grouped email, not two individual emails; enqueued counts task reminders (2), not payloads (1)
    expect(result).toEqual({ enqueued: 2, skipped: 0, workspaceCount: 1 })
    expect(mockBatchTrigger).not.toHaveBeenCalled()
    expect(mockGroupedBatchTrigger).toHaveBeenCalledTimes(1)
    const batch = mockGroupedBatchTrigger.mock.calls[0][0]
    expect(batch).toHaveLength(1)
    expect(batch[0].payload).toMatchObject({
      ledgerIds: ['l_1', 'l_2'],
      workspaceId: 'ws_1',
      tasks: [
        { taskTitle: 'Upload W-9', reminderType: TaskReminderType.DUE_DATE_TODAY },
        { taskTitle: 'Review contract', reminderType: TaskReminderType.DUE_DATE_OVERDUE_3D },
      ],
      recipientClientId: 'client_1',
      senderId: 'iu_1',
    })
  })

  it('does not abort the sweep when one workspace throws (per-workspace isolation)', async () => {
    mockGetEligibleReminders.mockResolvedValueOnce([
      buildRow({ workspaceId: 'ws_bad', taskId: 'task_bad' }),
      buildRow({ workspaceId: 'ws_good', taskId: 'task_good', assigneeId: 'client_good' }),
    ])
    mockTaskReminderSentCreateManyAndReturn
      .mockRejectedValueOnce(new Error('db blew up'))
      .mockResolvedValueOnce([
        { id: 'ledger_g', taskId: 'task_good', recipientId: 'client_good', reminderType: TaskReminderType.NO_DUE_DATE_3D },
      ])

    const result = await runJob()

    expect(result.workspaceCount).toBe(2)
    expect(result.enqueued).toBe(1)
  })
})
