import { GroupedEmailEventType } from '@prisma/client'

const mockSendGroupedEmail = jest.fn()
const mockCreateNotification = jest.fn()
const mockQueryRaw = jest.fn()
const mockExecuteRaw = jest.fn()
const mockFindManyTask = jest.fn()
const mockGetInternalUsers = jest.fn()
const mockCaptureException = jest.fn()

jest.mock('@trigger.dev/sdk/v3', () => ({
  task: ({ run }: { run: (payload: unknown) => unknown }) => ({ run, trigger: jest.fn() }),
  tasks: { onFailure: () => undefined },
  logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
}))

jest.mock('@/config', () => ({ copilotAPIKey: 'test-api-key' }))

jest.mock('@/jobs/sentry', () => ({
  Sentry: {
    captureException: (...args: unknown[]) => mockCaptureException(...args),
    addBreadcrumb: jest.fn(),
  },
}))

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
      $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
      task: { findMany: (...args: unknown[]) => mockFindManyTask(...args) },
    }),
  },
}))

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest
    .fn()
    .mockImplementation(() => ({ getInternalUsers: mockGetInternalUsers, createNotification: mockCreateNotification })),
}))

jest.mock('./send-grouped-email', () => ({
  sendGroupedEmail: (...args: unknown[]) => mockSendGroupedEmail(...args),
}))

import {
  enqueueGroupedEmailFlush,
  flushGroupedEmail,
  flushGroupedEmailOnFailure,
  flushGroupedEmailRun,
} from './flush-grouped-email'

let seq = 0
const row = (overrides: Record<string, unknown> = {}) => {
  seq += 1
  const base = {
    eventType: GroupedEmailEventType.ASSIGNED,
    taskId: `task_${seq}`,
    taskTitleSnapshot: `Task ${seq}`,
    createdAt: new Date(`2026-06-10T10:00:${String(seq).padStart(2, '0')}.000Z`),
    recipientClientId: 'client_1',
    recipientCompanyId: 'company_1',
    ...overrides,
  }
  // the snapshotted individual email captured at interception (replayed for single-event windows)
  return {
    ...base,
    individualEmail:
      'individualEmail' in overrides
        ? overrides.individualEmail
        : {
            senderId: 'actor_1',
            recipientClientId: base.recipientClientId,
            deliveryTargets: { email: { subject: base.taskTitleSnapshot } },
          },
  }
}

const payload = { workspaceId: 'ws_1', windowKey: 'client_1:win_1' }

beforeEach(() => {
  jest.clearAllMocks()
  seq = 0
  mockGetInternalUsers.mockResolvedValue({ data: [{ id: 'iu_1' }] })
  mockSendGroupedEmail.mockResolvedValue('notif_1')
  mockCreateNotification.mockResolvedValue({ id: 'notif_1' })
  mockExecuteRaw.mockResolvedValue(1)
  // default: every buffered task is live
  mockFindManyTask.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
    Promise.resolve(where.id.in.map((id) => ({ id }))),
  )
})

describe('flushGroupedEmailRun', () => {
  it('sends a grouped summary when the window has multiple live events', async () => {
    mockQueryRaw.mockResolvedValue([row(), row()])

    const result = await flushGroupedEmailRun(payload)

    expect(mockSendGroupedEmail).toHaveBeenCalledTimes(1)
    const args = mockSendGroupedEmail.mock.calls[0][0]
    expect(args).toMatchObject({ senderId: 'iu_1', recipientClientId: 'client_1', recipientCompanyId: 'company_1' })
    expect(args.content.totalEventCount).toBe(2)
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1) // markRecipientSent
    expect(result).toMatchObject({ recipients: 1, sent: 1 })
  })

  it('replays the original individual email when the window has a single live event', async () => {
    mockQueryRaw.mockResolvedValue([row()])

    const result = await flushGroupedEmailRun(payload)

    expect(mockCreateNotification).toHaveBeenCalledTimes(1)
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ recipientClientId: 'client_1' }))
    expect(mockSendGroupedEmail).not.toHaveBeenCalled()
    expect(mockGetInternalUsers).not.toHaveBeenCalled() // no workspace IU needed for the individual path
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ recipients: 1, sent: 1 })
  })

  it('falls back to the grouped summary when a single event has no snapshot (pre-migration row)', async () => {
    mockQueryRaw.mockResolvedValue([row({ individualEmail: null })])

    await flushGroupedEmailRun(payload)

    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockSendGroupedEmail).toHaveBeenCalledTimes(1)
    expect(mockSendGroupedEmail.mock.calls[0][0].content.totalEventCount).toBe(1)
  })

  it('no-ops when there are no unsent rows (idempotent re-run)', async () => {
    mockQueryRaw.mockResolvedValue([])

    const result = await flushGroupedEmailRun(payload)

    expect(mockGetInternalUsers).not.toHaveBeenCalled()
    expect(mockSendGroupedEmail).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockExecuteRaw).not.toHaveBeenCalled()
    expect(result).toMatchObject({ sent: 0, skipped: true })
  })

  it('falls back to the individual email when deleted tasks reduce the window to one live event', async () => {
    const live = row({ taskId: 'live', taskTitleSnapshot: 'Live task' })
    const dead = row({ taskId: 'dead', taskTitleSnapshot: 'Deleted task' })
    mockQueryRaw.mockResolvedValue([live, dead])
    mockFindManyTask.mockResolvedValue([{ id: 'live' }])

    await flushGroupedEmailRun(payload)

    expect(mockSendGroupedEmail).not.toHaveBeenCalled()
    expect(mockCreateNotification).toHaveBeenCalledTimes(1)
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryTargets: { email: { subject: 'Live task' } } }),
    )
  })

  it('marks the recipient sent without emailing when all their tasks were deleted', async () => {
    mockQueryRaw.mockResolvedValue([row({ taskId: 'dead' })])
    mockFindManyTask.mockResolvedValue([])

    const result = await flushGroupedEmailRun(payload)

    expect(mockSendGroupedEmail).not.toHaveBeenCalled()
    expect(mockCreateNotification).not.toHaveBeenCalled()
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ sent: 0 })
  })

  it('sends one individual email per recipient when single-event windows span multiple clients', async () => {
    mockQueryRaw.mockResolvedValue([row({ recipientClientId: 'client_a' }), row({ recipientClientId: 'client_b' })])

    const result = await flushGroupedEmailRun(payload)

    expect(mockCreateNotification).toHaveBeenCalledTimes(2)
    expect(mockSendGroupedEmail).not.toHaveBeenCalled()
    expect(mockExecuteRaw).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ recipients: 2, sent: 2 })
  })

  it('retries the individual email without senderCompanyId when the workspace rejects it', async () => {
    mockQueryRaw.mockResolvedValue([row()])
    mockCreateNotification
      .mockRejectedValueOnce({ message: 'bad', body: { message: 'sender company ID is invalid based on sender' } })
      .mockResolvedValueOnce({ id: 'notif_1' })

    await flushGroupedEmailRun(payload)

    expect(mockCreateNotification).toHaveBeenCalledTimes(2)
    expect(mockCreateNotification.mock.calls[1][0]).toMatchObject({ senderCompanyId: undefined })
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1)
  })

  it('does not mark a recipient sent when their send fails (so a retry re-sends)', async () => {
    mockQueryRaw.mockResolvedValue([row()])
    mockCreateNotification.mockRejectedValue(new Error('copilot 5xx'))

    await expect(flushGroupedEmailRun(payload)).rejects.toThrow('copilot 5xx')
    expect(mockExecuteRaw).not.toHaveBeenCalled()
  })

  it('throws when a grouped window has no internal user to send as', async () => {
    mockQueryRaw.mockResolvedValue([row(), row()])
    mockGetInternalUsers.mockResolvedValue({ data: [] })

    await expect(flushGroupedEmailRun(payload)).rejects.toThrow('no internal user')
    expect(mockSendGroupedEmail).not.toHaveBeenCalled()
  })
})

describe('enqueueGroupedEmailFlush', () => {
  it('triggers with a 5-minute delay and a workspace-scoped idempotency key', () => {
    enqueueGroupedEmailFlush(payload)

    expect(flushGroupedEmail.trigger).toHaveBeenCalledTimes(1)
    const [triggeredPayload, opts] = (flushGroupedEmail.trigger as jest.Mock).mock.calls[0]
    expect(triggeredPayload).toEqual(payload)
    expect(opts).toMatchObject({
      delay: '5m',
      idempotencyKey: 'ws_1:client_1:win_1',
      idempotencyKeyTTL: '10m',
    })
  })
})

describe('flushGroupedEmailOnFailure', () => {
  it('captures to Sentry with workspace and window tags', async () => {
    const error = new Error('terminal')

    await flushGroupedEmailOnFailure({ payload, error })

    expect(mockCaptureException).toHaveBeenCalledTimes(1)
    const [captured, opts] = mockCaptureException.mock.calls[0]
    expect(captured).toBe(error)
    expect((opts as { tags: Record<string, string> }).tags).toMatchObject({
      job: 'flush-grouped-email',
      workspaceId: 'ws_1',
      windowKey: 'client_1:win_1',
    })
  })
})
