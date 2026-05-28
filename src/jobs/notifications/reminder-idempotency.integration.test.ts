import { AssigneeType, TaskReminderType } from '@prisma/client'

import { WorkspaceResponse } from '@/types/common'

import { dbToday, disconnectTestDb, getTestDb, seedTask, uuid, ymdOffset } from '../../../test/integration/db'

// --- Doubles ---------------------------------------------------------------
// The DB is real (no @/lib/db mock). Copilot, Trigger.dev and Sentry are doubles: Copilot
// because we're not hitting a live API, Trigger.dev because there's no orchestrator in tests
// (batchTrigger fans out inline so the dispatcher's send + onFailure actually run), and
// Sentry to assert the capture without a transport.
const mockCreateNotification = jest.fn()
const mockGetWorkspace = jest.fn()
const mockGetCompanyClients = jest.fn()
const mockCaptureException = jest.fn()

jest.mock('@trigger.dev/sdk/v3', () => {
  type Handler = (args: { payload: unknown; error: unknown }) => Promise<void> | void
  // The dispatcher registers its onFailure at import time, before any module-scope const in
  // this file is initialized (ES import hoisting), so the registry lives on globalThis —
  // always initialized — instead of a const that would be in the temporal dead zone.
  const g = globalThis as unknown as { __onFailureHandlers?: Record<string, Handler> }
  const store = (): Record<string, Handler> => (g.__onFailureHandlers ??= {})
  return {
    schedules: { task: ({ run }: { run: (p: unknown) => unknown }) => ({ run }) },
    // batchTrigger runs each dispatch synchronously; a thrown run simulates retry-exhaustion
    // and invokes the task's registered onFailure (the real ledger-compensation path).
    task: ({ id, run }: { id: string; run: (p: unknown) => Promise<unknown> }) => ({
      id,
      run,
      batchTrigger: async (items: { payload: unknown }[]) => {
        for (const item of items) {
          try {
            await run(item.payload)
          } catch (error) {
            await store()[id]?.({ payload: item.payload, error })
          }
        }
        return { batchId: 'test-batch' }
      },
    }),
    tasks: {
      onFailure: (id: string, fn: Handler) => {
        store()[id] = fn
      },
    },
    logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
  }
})

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation(() => ({
    getWorkspace: mockGetWorkspace,
    getCompanyClients: mockGetCompanyClients,
    createNotification: mockCreateNotification,
  })),
}))

jest.mock('@/jobs/sentry', () => ({
  Sentry: { captureException: (...args: unknown[]) => mockCaptureException(...args) },
}))

import { sendTaskReminders } from './send-task-reminders'

// --- Helpers ---------------------------------------------------------------
const WS = 'ws_idem'
const workspace: WorkspaceResponse = {
  id: WS,
  brandName: 'Acme',
  labels: { individualTerm: 'client', individualTermPlural: 'clients', groupTerm: 'company', groupTermPlural: 'companies' },
}

const runCron = () =>
  (sendTaskReminders as unknown as { run: (p: { timestamp: Date }) => Promise<unknown> }).run({ timestamp: new Date() })

const seedEligibleClientTask = async () => {
  const today = await dbToday()
  const assigneeId = uuid()
  const taskId = await seedTask({
    workspaceId: WS,
    assigneeId,
    assigneeType: AssigneeType.client,
    companyId: uuid(),
    assignedAtYmd: ymdOffset(today, -3), // NO_DUE_DATE_3D window
    dueDate: null,
  })
  return { taskId, assigneeId }
}

beforeEach(async () => {
  jest.clearAllMocks()
  await getTestDb().$executeRawUnsafe(
    'TRUNCATE TABLE "TaskReminderSents", "Tasks", "WorkflowStates" RESTART IDENTITY CASCADE',
  )
  mockGetWorkspace.mockResolvedValue(workspace)
  mockCreateNotification.mockResolvedValue({ id: 'notif_1' })
})

afterAll(disconnectTestDb)

describe('reminder idempotency (real DB)', () => {
  it('sends one email and writes one ledger row for an eligible task', async () => {
    const { taskId } = await seedEligibleClientTask()

    await runCron()

    expect(mockCreateNotification).toHaveBeenCalledTimes(1)
    const rows = await getTestDb().taskReminderSent.findMany({ where: { taskId } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ taskId, workspaceId: WS, reminderType: TaskReminderType.NO_DUE_DATE_3D })
  })

  it('is idempotent: an immediate re-run adds no Copilot calls and no new ledger rows', async () => {
    await seedEligibleClientTask()

    await runCron()
    expect(mockCreateNotification).toHaveBeenCalledTimes(1)
    expect(await getTestDb().taskReminderSent.count()).toBe(1)

    await runCron() // same day, same task — the unique constraint dedupes
    expect(mockCreateNotification).toHaveBeenCalledTimes(1)
    expect(await getTestDb().taskReminderSent.count()).toBe(1)
  })

  it('on a terminal Copilot failure, deletes the ledger row and reports to Sentry', async () => {
    const { taskId, assigneeId } = await seedEligibleClientTask()
    mockCreateNotification.mockRejectedValue(new Error('copilot 500'))

    await runCron()

    // onFailure compensated the ledger so the next run can re-attempt.
    expect(await getTestDb().taskReminderSent.count()).toBe(0)
    expect(mockCaptureException).toHaveBeenCalledTimes(1)
    const [, opts] = mockCaptureException.mock.calls[0]
    expect((opts as { tags: Record<string, string> }).tags).toMatchObject({
      job: 'dispatch-reminder-email',
      taskId,
      recipientId: assigneeId,
      reminderType: TaskReminderType.NO_DUE_DATE_3D,
      workspaceId: WS,
    })
  })
})
