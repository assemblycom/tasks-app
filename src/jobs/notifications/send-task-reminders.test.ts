import { AssigneeType, TaskReminderType } from '@prisma/client'

const mockTaskReminderSentCreateManyAndReturn = jest.fn()
const mockGetEligibleReminders = jest.fn()
const mockBatchTrigger = jest.fn()
const mockGetWorkspace = jest.fn()
const mockGetCompanyClients = jest.fn()
const mockCopilotApiCtor = jest.fn()

jest.mock('@trigger.dev/sdk/v3', () => ({
  schedules: {
    task: ({ run }: { run: (payload: unknown, ctx?: unknown) => unknown }) => ({ run }),
  },
  logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
}))

jest.mock('@/config', () => ({ copilotAPIKey: 'test-api-key' }))

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      taskReminderSent: { createManyAndReturn: mockTaskReminderSentCreateManyAndReturn },
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
const runJob = async (): Promise<RunResult> => {
  const { run } = sendTaskReminders as unknown as { run: (payload: { timestamp: Date }) => Promise<RunResult> }
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
    mockGetEligibleReminders.mockReset()
    mockBatchTrigger.mockReset()
    mockGetWorkspace.mockReset()
    mockGetCompanyClients.mockReset()
    mockCopilotApiCtor.mockReset()
    mockGetWorkspace.mockResolvedValue(workspace)
    mockBatchTrigger.mockResolvedValue({ batchId: 'b1' })
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
