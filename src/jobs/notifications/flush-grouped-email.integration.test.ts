import { GroupedEmailEventType, Prisma } from '@prisma/client'

// The DB is real (testcontainer). CopilotAPI, Trigger.dev and Sentry are doubles.
const mockCreateNotification = jest.fn()
const mockGetInternalUsers = jest.fn()
const mockCaptureException = jest.fn()

jest.mock('@trigger.dev/sdk/v3', () => ({
  task: ({ run }: { run: (p: unknown) => unknown }) => ({ run, trigger: jest.fn() }),
  tasks: { onFailure: () => undefined },
  logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
}))

jest.mock('@/config', () => ({ copilotAPIKey: 'test-key' }))

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation(() => ({
    getInternalUsers: mockGetInternalUsers,
    createNotification: mockCreateNotification,
  })),
}))

jest.mock('@/jobs/sentry', () => ({
  Sentry: {
    captureException: (...args: unknown[]) => mockCaptureException(...args),
    addBreadcrumb: jest.fn(),
  },
}))

import { disconnectTestDb, getTestDb, seedTask, uuid } from '../../../test/integration/db'
import { flushGroupedEmailRun } from './flush-grouped-email'

const WS = 'ws_flush_idem'
const CLIENT_A = '11111111-1111-1111-1111-111111111111'
const CLIENT_B = '22222222-2222-2222-2222-222222222222'
const COMPANY = '33333333-3333-3333-3333-333333333333'
const IU_SENDER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const snapshot = (recipientClientId: string, subject = 'A task') => ({
  senderId: IU_SENDER,
  recipientClientId,
  deliveryTargets: { email: { subject } },
})

type SeedEventInput = {
  windowKey: string
  taskId: string
  recipientClientId: string
  eventType?: GroupedEmailEventType
  taskTitleSnapshot?: string
  recipientCompanyId?: string | null
  individualEmail?: object | null
}

const seedEvent = async ({
  windowKey,
  taskId,
  recipientClientId,
  eventType = GroupedEmailEventType.ASSIGNED,
  taskTitleSnapshot = 'Test task',
  recipientCompanyId = COMPANY,
  individualEmail,
}: SeedEventInput): Promise<void> => {
  const email = individualEmail !== undefined ? individualEmail : snapshot(recipientClientId)
  await getTestDb().groupedEmailEvent.createMany({
    data: [
      {
        id: uuid(),
        workspaceId: WS,
        windowKey,
        taskId,
        recipientClientId,
        recipientCompanyId,
        eventType,
        taskTitleSnapshot,
        commentId: null,
        sentAt: null,
        individualEmail: email as unknown as Prisma.InputJsonValue,
      },
    ],
  })
}

const unsentCount = async (windowKey: string): Promise<number> => {
  const rows = await getTestDb().$queryRaw<{ count: bigint }[]>`
    SELECT count(*) FROM "GroupedEmailEvents" WHERE "windowKey" = ${windowKey} AND "sentAt" IS NULL`
  return Number(rows[0].count)
}

beforeEach(async () => {
  jest.clearAllMocks()
  await getTestDb().$executeRawUnsafe(
    'TRUNCATE TABLE "GroupedEmailEvents", "Tasks", "WorkflowStates" RESTART IDENTITY CASCADE',
  )
  mockGetInternalUsers.mockResolvedValue({ data: [{ id: IU_SENDER }] })
  mockCreateNotification.mockResolvedValue({ id: 'notif_1' })
})

afterAll(disconnectTestDb)

describe('flush-grouped-email idempotency (real DB)', () => {
  it('sends one grouped email for multiple events and marks every row as sent', async () => {
    const window = 'win_multi_event'
    const taskA = await seedTask({ workspaceId: WS, assigneeId: CLIENT_A, assigneeType: 'client', companyId: COMPANY })
    const taskB = await seedTask({ workspaceId: WS, assigneeId: CLIENT_A, assigneeType: 'client', companyId: COMPANY })
    await seedEvent({
      windowKey: window,
      taskId: taskA,
      recipientClientId: CLIENT_A,
      eventType: GroupedEmailEventType.ASSIGNED,
    })
    await seedEvent({
      windowKey: window,
      taskId: taskB,
      recipientClientId: CLIENT_A,
      eventType: GroupedEmailEventType.SHARED,
    })

    const result = await flushGroupedEmailRun({ workspaceId: WS, windowKey: window })

    expect(mockCreateNotification).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ recipients: 1, sent: 1, sentGrouped: 1, sentIndividual: 0 })
    expect(await unsentCount(window)).toBe(0)
  })

  it('is idempotent: re-flushing a fully-sent window is a no-op', async () => {
    const window = 'win_idempotent'
    const taskA = await seedTask({ workspaceId: WS, assigneeId: CLIENT_A, assigneeType: 'client', companyId: COMPANY })
    const taskB = await seedTask({ workspaceId: WS, assigneeId: CLIENT_A, assigneeType: 'client', companyId: COMPANY })
    await seedEvent({
      windowKey: window,
      taskId: taskA,
      recipientClientId: CLIENT_A,
      eventType: GroupedEmailEventType.ASSIGNED,
    })
    await seedEvent({
      windowKey: window,
      taskId: taskB,
      recipientClientId: CLIENT_A,
      eventType: GroupedEmailEventType.SHARED,
    })

    await flushGroupedEmailRun({ workspaceId: WS, windowKey: window })
    expect(mockCreateNotification).toHaveBeenCalledTimes(1)

    // Second flush: all rows already have sentAt set — no email, skipped return.
    const result = await flushGroupedEmailRun({ workspaceId: WS, windowKey: window })
    expect(mockCreateNotification).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ skipped: true })
  })

  it('does not mark recipients sent when a send fails, allowing a retry to re-send', async () => {
    const window = 'win_retry'
    const taskA = await seedTask({ workspaceId: WS, assigneeId: CLIENT_A, assigneeType: 'client', companyId: COMPANY })
    const taskB = await seedTask({ workspaceId: WS, assigneeId: CLIENT_A, assigneeType: 'client', companyId: COMPANY })
    await seedEvent({
      windowKey: window,
      taskId: taskA,
      recipientClientId: CLIENT_A,
      eventType: GroupedEmailEventType.ASSIGNED,
    })
    await seedEvent({
      windowKey: window,
      taskId: taskB,
      recipientClientId: CLIENT_A,
      eventType: GroupedEmailEventType.SHARED,
    })

    mockCreateNotification.mockRejectedValueOnce(new Error('copilot 5xx'))
    await expect(flushGroupedEmailRun({ workspaceId: WS, windowKey: window })).rejects.toThrow('copilot 5xx')

    // Rows are still unsent — retry can re-attempt.
    expect(await unsentCount(window)).toBe(2)

    // Retry succeeds.
    mockCreateNotification.mockResolvedValueOnce({ id: 'notif_2' })
    await flushGroupedEmailRun({ workspaceId: WS, windowKey: window })
    expect(mockCreateNotification).toHaveBeenCalledTimes(2)
    expect(await unsentCount(window)).toBe(0)
  })

  it('sends one email per recipient when the window holds events for multiple clients', async () => {
    const window = 'win_multi_recipient'
    const taskA = await seedTask({ workspaceId: WS, assigneeId: CLIENT_A, assigneeType: 'client', companyId: COMPANY })
    const taskB = await seedTask({ workspaceId: WS, assigneeId: CLIENT_B, assigneeType: 'client', companyId: COMPANY })
    // Two events for client_a, two for client_b — each gets a grouped summary.
    const taskC = await seedTask({ workspaceId: WS, assigneeId: CLIENT_A, assigneeType: 'client', companyId: COMPANY })
    const taskD = await seedTask({ workspaceId: WS, assigneeId: CLIENT_B, assigneeType: 'client', companyId: COMPANY })
    await seedEvent({
      windowKey: window,
      taskId: taskA,
      recipientClientId: CLIENT_A,
      eventType: GroupedEmailEventType.ASSIGNED,
    })
    await seedEvent({
      windowKey: window,
      taskId: taskC,
      recipientClientId: CLIENT_A,
      eventType: GroupedEmailEventType.SHARED,
    })
    await seedEvent({
      windowKey: window,
      taskId: taskB,
      recipientClientId: CLIENT_B,
      eventType: GroupedEmailEventType.ASSIGNED,
    })
    await seedEvent({
      windowKey: window,
      taskId: taskD,
      recipientClientId: CLIENT_B,
      eventType: GroupedEmailEventType.SHARED,
    })

    const result = await flushGroupedEmailRun({ workspaceId: WS, windowKey: window })

    expect(mockCreateNotification).toHaveBeenCalledTimes(2)
    const recipients = mockCreateNotification.mock.calls.map((c) => c[0].recipientClientId).sort()
    expect(recipients).toEqual([CLIENT_A, CLIENT_B].sort())
    expect(result).toMatchObject({ recipients: 2, sent: 2, sentGrouped: 2, sentIndividual: 0 })
    expect(await unsentCount(window)).toBe(0)
  })

  it('skips events for archived tasks and marks their rows sent without emailing', async () => {
    const window = 'win_archived'
    const archivedTask = await seedTask({
      workspaceId: WS,
      assigneeId: CLIENT_A,
      assigneeType: 'client',
      companyId: COMPANY,
      isArchived: true,
    })
    await seedEvent({ windowKey: window, taskId: archivedTask, recipientClientId: CLIENT_A })
    // Second event for a live task alongside the archived one — still triggers a grouped path.
    const liveTask = await seedTask({ workspaceId: WS, assigneeId: CLIENT_A, assigneeType: 'client', companyId: COMPANY })
    await seedEvent({
      windowKey: window,
      taskId: liveTask,
      recipientClientId: CLIENT_A,
      eventType: GroupedEmailEventType.SHARED,
    })

    const result = await flushGroupedEmailRun({ workspaceId: WS, windowKey: window })

    // Only the live task appears in the grouped email (1 event); individual snapshot path.
    expect(mockCreateNotification).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ sentGrouped: 0, sentIndividual: 1 })
    // All rows are marked sent regardless of whether the task was live.
    expect(await unsentCount(window)).toBe(0)
  })

  it('marks the recipient sent without emailing when every task in the window was archived', async () => {
    const window = 'win_all_archived'
    const archivedTask = await seedTask({
      workspaceId: WS,
      assigneeId: CLIENT_A,
      assigneeType: 'client',
      companyId: COMPANY,
      isArchived: true,
    })
    await seedEvent({ windowKey: window, taskId: archivedTask, recipientClientId: CLIENT_A })

    const result = await flushGroupedEmailRun({ workspaceId: WS, windowKey: window })

    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(result).toMatchObject({ sent: 0 })
    expect(await unsentCount(window)).toBe(0)
  })

  it('marks the recipient sent without emailing when every task in the window was soft-deleted', async () => {
    const window = 'win_all_deleted'
    const deletedTask = await seedTask({
      workspaceId: WS,
      assigneeId: CLIENT_A,
      assigneeType: 'client',
      companyId: COMPANY,
      deletedAt: new Date(),
    })
    await seedEvent({ windowKey: window, taskId: deletedTask, recipientClientId: CLIENT_A })

    const result = await flushGroupedEmailRun({ workspaceId: WS, windowKey: window })

    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(result).toMatchObject({ sent: 0 })
    expect(await unsentCount(window)).toBe(0)
  })
})
