import { AssigneeType, TaskReminderType } from '@prisma/client'

import { getEligibleReminders } from '@/jobs/notifications/eligibility'

import { dbToday, disconnectTestDb, getTestDb, seedTask, uuid, ymdOffset } from '../../../test/integration/db'

// getEligibleReminders is typed against the extended DBClient; the plain test client exposes
// the same $queryRaw, so the cast is safe.
type DbArg = Parameters<typeof getEligibleReminders>[0]
const run = () => getEligibleReminders(getTestDb() as unknown as DbArg)
const byTask = (rows: Awaited<ReturnType<typeof run>>) => new Map(rows.map((r) => [r.taskId, r]))

const WS = 'ws_elig'
let today: string

beforeEach(async () => {
  await getTestDb().$executeRawUnsafe(
    'TRUNCATE TABLE "TaskReminderSents", "Tasks", "WorkflowStates" RESTART IDENTITY CASCADE',
  )
  today = await dbToday()
})

afterAll(disconnectTestDb)

// A client-assigned task that lands exactly on a window today.
const seedClientTask = (overrides: Partial<Parameters<typeof seedTask>[0]> = {}) =>
  seedTask({
    workspaceId: WS,
    assigneeId: uuid(),
    assigneeType: AssigneeType.client,
    companyId: uuid(),
    ...overrides,
  })

describe('getEligibleReminders — windows', () => {
  it('matches each of the six reminder windows on its exact day', async () => {
    const ids = {
      [TaskReminderType.NO_DUE_DATE_3D]: await seedClientTask({ assignedAtYmd: ymdOffset(today, -3), dueDate: null }),
      [TaskReminderType.NO_DUE_DATE_7D]: await seedClientTask({ assignedAtYmd: ymdOffset(today, -7), dueDate: null }),
      [TaskReminderType.DUE_DATE_BEFORE_3D]: await seedClientTask({ dueDate: ymdOffset(today, 3) }),
      [TaskReminderType.DUE_DATE_TODAY]: await seedClientTask({ dueDate: today }),
      [TaskReminderType.DUE_DATE_OVERDUE_3D]: await seedClientTask({ dueDate: ymdOffset(today, -3) }),
      [TaskReminderType.DUE_DATE_OVERDUE_7D]: await seedClientTask({ dueDate: ymdOffset(today, -7) }),
    }

    const rows = byTask(await run())

    expect(rows.size).toBe(6)
    for (const [reminderType, taskId] of Object.entries(ids)) {
      expect(rows.get(taskId)?.reminderType).toBe(reminderType)
    }
  })

  it('excludes tasks one day off either side of every window boundary', async () => {
    // No-due-date windows are exactly -3 and -7; due-date windows are exactly -7/-3/0/+3.
    await seedClientTask({ assignedAtYmd: ymdOffset(today, -2), dueDate: null })
    await seedClientTask({ assignedAtYmd: ymdOffset(today, -4), dueDate: null })
    await seedClientTask({ assignedAtYmd: ymdOffset(today, -6), dueDate: null })
    await seedClientTask({ assignedAtYmd: ymdOffset(today, -8), dueDate: null })
    await seedClientTask({ dueDate: ymdOffset(today, 1) })
    await seedClientTask({ dueDate: ymdOffset(today, 2) })
    await seedClientTask({ dueDate: ymdOffset(today, 4) })
    await seedClientTask({ dueDate: ymdOffset(today, -1) })
    await seedClientTask({ dueDate: ymdOffset(today, -2) })
    await seedClientTask({ dueDate: ymdOffset(today, -4) })

    expect(await run()).toHaveLength(0)
  })
})

describe('getEligibleReminders — exclusions', () => {
  it('excludes deleted, archived, and completed tasks but keeps an otherwise-identical control', async () => {
    const window = { assignedAtYmd: ymdOffset(today, -3), dueDate: null } as const
    const control = await seedClientTask(window)
    await seedClientTask({ ...window, deletedAt: new Date() })
    await seedClientTask({ ...window, isArchived: true })
    await seedClientTask({ ...window, completedAt: new Date() })

    const rows = await run()

    expect(rows.map((r) => r.taskId)).toEqual([control])
  })
})

describe('getEligibleReminders — company assignment', () => {
  it('emits a single company-level row (fan-out to members happens in the cron, not the SQL)', async () => {
    const companyId = uuid()
    const taskId = await seedTask({
      workspaceId: WS,
      assigneeId: companyId,
      assigneeType: AssigneeType.company,
      assignedAtYmd: ymdOffset(today, -3),
      dueDate: null,
    })

    const rows = await run()

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      taskId,
      assigneeType: AssigneeType.company,
      companyId, // company tasks report companyId = assigneeId
      reminderType: TaskReminderType.NO_DUE_DATE_3D,
    })
  })
})

describe('getEligibleReminders — subtasks', () => {
  const aliveParent = (assigneeId: string | null) =>
    seedTask({
      workspaceId: WS,
      assigneeId,
      assigneeType: assigneeId ? AssigneeType.client : null,
      assignedAtYmd: today, // parent itself is not in any window
      dueDate: null,
    })

  it('includes a standalone subtask whose assignee differs from its parent', async () => {
    const parentId = await aliveParent(uuid())
    const child = await seedClientTask({ parentId, assignedAtYmd: ymdOffset(today, -3), dueDate: null })

    expect((await run()).map((r) => r.taskId)).toEqual([child])
  })

  it("excludes a subtask that shares its alive parent's assignee", async () => {
    const sharedAssignee = uuid()
    const parentId = await aliveParent(sharedAssignee)
    await seedClientTask({
      parentId,
      assigneeId: sharedAssignee,
      assignedAtYmd: ymdOffset(today, -3),
      dueDate: null,
    })

    expect(await run()).toHaveLength(0)
  })

  it('includes a subtask whose parent has no assignee', async () => {
    const parentId = await aliveParent(null)
    const child = await seedClientTask({ parentId, assignedAtYmd: ymdOffset(today, -3), dueDate: null })

    expect((await run()).map((r) => r.taskId)).toEqual([child])
  })

  it('includes a same-assignee subtask when the parent is completed (dead parent treated as absent)', async () => {
    const sharedAssignee = uuid()
    const parentId = await seedTask({
      workspaceId: WS,
      assigneeId: sharedAssignee,
      assigneeType: AssigneeType.client,
      assignedAtYmd: today,
      dueDate: null,
      completedAt: new Date(), // dead parent → does not join → carve-out does not apply
    })
    const child = await seedClientTask({
      parentId,
      assigneeId: sharedAssignee,
      assignedAtYmd: ymdOffset(today, -3),
      dueDate: null,
    })

    expect((await run()).map((r) => r.taskId)).toEqual([child])
  })
})
