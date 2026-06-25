import { NotificationTaskActions } from '@/app/api/core/types/tasks'
import { UserRole } from '@/app/api/core/types/user'
import { AssigneeType, GroupedEmailEventType, Task } from '@prisma/client'

const mockEnqueueFlush = jest.fn()

const mockFindFirst = jest.fn()
const mockFindMany = jest.fn()
const mockClientNotifCreate = jest.fn()
const mockClientNotifCreateMany = jest.fn()
const mockQueryRaw = jest.fn()
const mockGroupedCreateMany = jest.fn()

const mockGetWorkspace = jest.fn()
const mockMe = jest.fn()
const mockCreateNotification = jest.fn()

jest.mock('@/jobs/notifications/flush-grouped-email', () => ({
  enqueueGroupedEmailFlush: (...args: unknown[]) => mockEnqueueFlush(...args),
}))

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      clientNotification: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
        findMany: (...args: unknown[]) => mockFindMany(...args),
        create: (...args: unknown[]) => mockClientNotifCreate(...args),
        createMany: (...args: unknown[]) => mockClientNotifCreateMany(...args),
      },
      groupedEmailEvent: { createMany: (...args: unknown[]) => mockGroupedCreateMany(...args) },
      $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    }),
  },
}))

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation(() => ({
    getWorkspace: (...args: unknown[]) => mockGetWorkspace(...args),
    me: (...args: unknown[]) => mockMe(...args),
    createNotification: (...args: unknown[]) => mockCreateNotification(...args),
  })),
}))

import { NotificationService } from './notification.service'

const user = {
  token: 'tok',
  role: UserRole.IU,
  workspaceId: 'ws_1',
  internalUserId: 'iu_1',
} as unknown as ConstructorParameters<typeof NotificationService>[0]

const makeTask = (overrides: Partial<Task> = {}): Task =>
  ({
    id: '11111111-1111-1111-1111-111111111111',
    workspaceId: 'ws_1',
    title: 'My task',
    companyId: '22222222-2222-2222-2222-222222222222',
    clientId: null,
    assigneeId: '33333333-3333-3333-3333-333333333333',
    assigneeType: AssigneeType.client,
    createdById: 'creator_1',
    associations: [],
    isArchived: false,
    ...overrides,
  }) as unknown as Task

const buildService = () => {
  const service = new NotificationService(user)
  jest.spyOn(service, 'getNotificationParties').mockResolvedValue({
    senderId: 'creator_1',
    senderCompanyId: undefined,
    recipientId: '33333333-3333-3333-3333-333333333333',
    recipientIds: [],
    actionUser: 'Jane IU',
    companyName: undefined,
  })
  return service
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetWorkspace.mockResolvedValue({ labels: {} })
  mockMe.mockResolvedValue({ id: 'creator_1', givenName: 'Jane', familyName: 'IU' })
  mockFindFirst.mockResolvedValue(null)
  mockFindMany.mockResolvedValue([])
  mockQueryRaw.mockResolvedValue([])
  mockGroupedCreateMany.mockResolvedValue({ count: 1 })
  mockClientNotifCreate.mockResolvedValue({})
  mockClientNotifCreateMany.mockResolvedValue({ count: 1 })
  mockCreateNotification.mockResolvedValue({
    id: 'notif_1',
    createdAt: '2026-06-15T10:00:00.000Z',
    recipientClientId: '33333333-3333-3333-3333-333333333333',
  })
})

const deliveryTargetsOf = (call: number) => mockCreateNotification.mock.calls[call][0].deliveryTargets

describe('NotificationService grouped-email interception', () => {
  describe('create()', () => {
    it('buffers an Assigned CU email, opens a window, and still sends the in-product notification without email', async () => {
      const task = makeTask()
      await buildService().create(NotificationTaskActions.Assigned, task)

      expect(mockGroupedCreateMany).toHaveBeenCalledTimes(1)
      const row = mockGroupedCreateMany.mock.calls[0][0].data[0]
      expect(row).toMatchObject({
        workspaceId: 'ws_1',
        recipientClientId: task.assigneeId,
        recipientCompanyId: task.companyId,
        eventType: GroupedEmailEventType.ASSIGNED,
        taskId: task.id,
        taskTitleSnapshot: 'My task',
        commentId: null,
      })
      // window is scoped to the (clientId, companyId) pair, not the client alone
      expect(row.windowKey).toMatch(new RegExp(`^${task.assigneeId}:${task.companyId}:`))
      expect(mockQueryRaw.mock.calls[0]).toContain(task.companyId)
      expect(mockEnqueueFlush).toHaveBeenCalledWith({ workspaceId: 'ws_1', windowKey: row.windowKey })

      // the row snapshots the exact individual email to replay for a single-event window
      expect(row.individualEmail.recipientClientId).toBe(task.assigneeId)
      expect(row.individualEmail.deliveryTargets.email).toBeDefined()
      expect(row.individualEmail.deliveryTargets.inProduct).toBeUndefined()

      // in-product still fires, email is stripped
      expect(mockCreateNotification).toHaveBeenCalledTimes(1)
      expect(deliveryTargetsOf(0).inProduct).toBeDefined()
      expect(deliveryTargetsOf(0).email).toBeUndefined()

      // and it must still be routed to the client, not misclassified as an IU
      const sent = mockCreateNotification.mock.calls[0][0]
      expect(sent.recipientClientId).toBe(task.assigneeId)
      expect(sent.recipientInternalUserId).toBeUndefined()
    })

    it('reuses an existing unclaimed window and does not enqueue a second timer', async () => {
      mockQueryRaw.mockResolvedValue([{ windowKey: 'existing-window-key' }])

      await buildService().create(NotificationTaskActions.Assigned, makeTask())

      expect(mockGroupedCreateMany.mock.calls[0][0].data[0].windowKey).toBe('existing-window-key')
      expect(mockEnqueueFlush).not.toHaveBeenCalled()
    })

    it('keys the window on (clientId, companyId) so a multi-company client does not get merged', async () => {
      const companyB = '99999999-9999-9999-9999-999999999999'
      await buildService().create(NotificationTaskActions.Assigned, makeTask({ companyId: companyB }))

      const row = mockGroupedCreateMany.mock.calls[0][0].data[0]
      expect(row.recipientCompanyId).toBe(companyB)
      expect(row.windowKey).toMatch(new RegExp(`^33333333-3333-3333-3333-333333333333:${companyB}:`))
      expect(mockQueryRaw.mock.calls[0]).toContain(companyB)
    })

    it('does not buffer or strip email for a non-target action (byte-for-byte)', async () => {
      await buildService().create(
        NotificationTaskActions.CompletedToSharedCU,
        makeTask({ assigneeType: AssigneeType.internalUser }),
      )

      expect(mockGroupedCreateMany).not.toHaveBeenCalled()
      expect(mockEnqueueFlush).not.toHaveBeenCalled()
      expect(mockCreateNotification).toHaveBeenCalledTimes(1)
      expect(deliveryTargetsOf(0).email).toBeDefined()
    })

    it('sends htmlBody and drops the default template body when the override omits body', async () => {
      await buildService().create(
        NotificationTaskActions.CompletedToSharedCU,
        makeTask({ assigneeType: AssigneeType.internalUser }),
        {
          disableEmail: false,
          emailOverride: { htmlBody: '<h1>Custom</h1>' },
        },
      )

      expect(mockCreateNotification).toHaveBeenCalledTimes(1)
      expect(deliveryTargetsOf(0).email.htmlBody).toBe('<h1>Custom</h1>')
      expect(deliveryTargetsOf(0).email.body).toBeUndefined()
    })

    it('keeps an explicit body alongside htmlBody', async () => {
      await buildService().create(
        NotificationTaskActions.CompletedToSharedCU,
        makeTask({ assigneeType: AssigneeType.internalUser }),
        {
          disableEmail: false,
          emailOverride: { htmlBody: '<h1>Custom</h1>', body: 'plain text fallback' },
        },
      )

      expect(deliveryTargetsOf(0).email.htmlBody).toBe('<h1>Custom</h1>')
      expect(deliveryTargetsOf(0).email.body).toBe('plain text fallback')
    })

    it('retains the default template body when no htmlBody override is given', async () => {
      await buildService().create(
        NotificationTaskActions.CompletedToSharedCU,
        makeTask({ assigneeType: AssigneeType.internalUser }),
        { disableEmail: false },
      )

      expect(deliveryTargetsOf(0).email.body).toBeDefined()
      expect(deliveryTargetsOf(0).email.htmlBody).toBeUndefined()
    })

    it('does not buffer when there is no CU email (e.g. disableEmail / IU recipient)', async () => {
      await buildService().create(NotificationTaskActions.Assigned, makeTask(), { disableEmail: true })

      expect(mockGroupedCreateMany).not.toHaveBeenCalled()
      expect(mockEnqueueFlush).not.toHaveBeenCalled()
    })
  })

  describe('createBulkNotification()', () => {
    it('buffers a Commented CU email per recipient and skips the Copilot dispatch (no in-product)', async () => {
      const task = makeTask()
      await buildService().createBulkNotification(NotificationTaskActions.Commented, task, ['cu_a', 'cu_b'], {
        email: true,
        disableInProduct: true,
        commentId: '44444444-4444-4444-4444-444444444444',
      })

      expect(mockGroupedCreateMany).toHaveBeenCalledTimes(2)
      const recipients = mockGroupedCreateMany.mock.calls.map((c) => c[0].data[0].recipientClientId)
      expect(recipients).toEqual(['cu_a', 'cu_b'])
      expect(mockGroupedCreateMany.mock.calls[0][0].data[0]).toMatchObject({
        eventType: GroupedEmailEventType.COMMENT,
        commentId: '44444444-4444-4444-4444-444444444444',
      })
      // nothing left to deliver → Copilot is never called
      expect(mockCreateNotification).not.toHaveBeenCalled()
    })

    it('buffers one row per company client and keeps the fan-out', async () => {
      await buildService().createBulkNotification(
        NotificationTaskActions.SharedToCompany,
        makeTask(),
        ['cu_a', 'cu_b', 'cu_c'],
        {
          email: true,
        },
      )

      expect(mockGroupedCreateMany).toHaveBeenCalledTimes(3)
      const recipients = mockGroupedCreateMany.mock.calls.map((c) => c[0].data[0].recipientClientId)
      expect(recipients).toEqual(['cu_a', 'cu_b', 'cu_c'])
    })

    it('falls back to the association company when the shared task has no companyId', async () => {
      const assocCompany = '88888888-8888-8888-8888-888888888888'
      const task = makeTask({
        companyId: null,
        associations: [{ companyId: assocCompany }] as unknown as Task['associations'],
      })

      await buildService().createBulkNotification(NotificationTaskActions.SharedToCompany, task, ['cu_a'], { email: true })

      expect(mockGroupedCreateMany.mock.calls[0][0].data[0].recipientCompanyId).toBe(assocCompany)
    })

    it('does not buffer for a bulk action that carries no email', async () => {
      await buildService().createBulkNotification(NotificationTaskActions.Commented, makeTask(), ['cu_a'], {
        email: false,
        disableInProduct: false,
        commentId: '44444444-4444-4444-4444-444444444444',
      })

      expect(mockGroupedCreateMany).not.toHaveBeenCalled()
      expect(mockCreateNotification).toHaveBeenCalledTimes(1)
    })
  })
})

describe('guard: CU wiring boundaries', () => {
  it('maps every CU-targeted action to the correct GroupedEmailEventType', () => {
    const svc = buildService() as unknown as {
      groupedEventTypeFor: (a: NotificationTaskActions) => GroupedEmailEventType | null
    }
    expect(svc.groupedEventTypeFor(NotificationTaskActions.Assigned)).toBe(GroupedEmailEventType.ASSIGNED)
    expect(svc.groupedEventTypeFor(NotificationTaskActions.AssignedToCompany)).toBe(GroupedEmailEventType.ASSIGNED)
    expect(svc.groupedEventTypeFor(NotificationTaskActions.Shared)).toBe(GroupedEmailEventType.SHARED)
    expect(svc.groupedEventTypeFor(NotificationTaskActions.SharedToCompany)).toBe(GroupedEmailEventType.SHARED)
    expect(svc.groupedEventTypeFor(NotificationTaskActions.Commented)).toBe(GroupedEmailEventType.COMMENT)
  })

  it('returns null for every action that must not be buffered', () => {
    const svc = buildService() as unknown as {
      groupedEventTypeFor: (a: NotificationTaskActions) => GroupedEmailEventType | null
    }
    const mapped = [
      NotificationTaskActions.Assigned,
      NotificationTaskActions.AssignedToCompany,
      NotificationTaskActions.Shared,
      NotificationTaskActions.SharedToCompany,
      NotificationTaskActions.Commented,
    ]
    const unmapped = Object.values(NotificationTaskActions).filter((a) => !mapped.includes(a))
    for (const action of unmapped) {
      expect(svc.groupedEventTypeFor(action)).toBeNull()
    }
  })

  it('never returns COMPLETED — that type is reserved for the deferred IU milestone', () => {
    const svc = buildService() as unknown as {
      groupedEventTypeFor: (a: NotificationTaskActions) => GroupedEmailEventType | null
    }
    const allActions = Object.values(NotificationTaskActions)
    for (const action of allActions) {
      expect(svc.groupedEventTypeFor(action)).not.toBe(GroupedEmailEventType.COMPLETED)
    }
  })

  it('never writes recipientIuId in a CU grouped event row', async () => {
    await buildService().create(NotificationTaskActions.Assigned, makeTask())
    const row = mockGroupedCreateMany.mock.calls[0][0].data[0]
    expect(row.recipientIuId).toBeUndefined()
  })
})
