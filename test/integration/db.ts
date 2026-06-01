import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'

import { AssigneeType, PrismaClient, StateType } from '@prisma/client'

import { DB_URL_FILE } from './paths'

export const uuid = (): string => crypto.randomUUID()

let client: PrismaClient | undefined

// A plain client with NO soft-delete extensions, so seeds can set deletedAt/isArchived
// freely and assertions see exactly what's in the table. The URL is read from the temp file
// (never the ambient env) and guarded: a destructive TRUNCATE must only ever hit the
// ephemeral testcontainer, never a real DB the dev .env might point at.
export const getTestDb = (): PrismaClient => {
  if (client) return client
  const url = readFileSync(DB_URL_FILE, 'utf8').trim()
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error(`Refusing non-local DB for integration tests: ${url.replace(/:\/\/[^@]*@/, '://***@')}`)
  }
  client = new PrismaClient({ datasources: { db: { url } } })
  return client
}

export const disconnectTestDb = async (): Promise<void> => {
  await client?.$disconnect()
  client = undefined
}

export const truncateAll = async (): Promise<void> => {
  await getTestDb().$executeRawUnsafe(
    'TRUNCATE TABLE "TaskReminderSents", "Tasks", "WorkflowStates" RESTART IDENTITY CASCADE',
  )
}

// Anchor all date math to the DB clock (UTC), not JS now, so window/boundary assertions
// can't flake across a UTC midnight boundary.
export const dbToday = async (): Promise<string> => {
  const rows = await getTestDb().$queryRaw<{ today: string }[]>`SELECT CURRENT_DATE::text AS today`
  return rows[0].today
}

export const ymdOffset = (baseYmd: string, days: number): string => {
  const d = new Date(`${baseYmd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// assignedAt is a `timestamp without time zone`; storing at noon UTC keeps its ::date cast
// on the intended day regardless of the small UTC offset Prisma applies.
const noonUtc = (ymd: string): Date => new Date(`${ymd}T12:00:00Z`)

export const seedWorkflowState = async (workspaceId: string, type: StateType = StateType.started): Promise<string> => {
  const id = uuid()
  await getTestDb().workflowState.create({
    data: { id, workspaceId, type, name: 'State', key: `state-${id.slice(0, 8)}` },
  })
  return id
}

export type SeedTaskInput = {
  workspaceId: string
  workflowStateId?: string
  assigneeId?: string | null
  assigneeType?: AssigneeType | null
  companyId?: string | null
  internalUserId?: string | null
  clientId?: string | null
  dueDate?: string | null
  assignedAtYmd?: string | null
  completedAt?: Date | null
  isArchived?: boolean
  deletedAt?: Date | null
  parentId?: string | null
  title?: string
  createdById?: string
}

// The Tasks table has an `assignee_to_user_id_mapping` CHECK that ties assigneeType to which
// of internalUserId/clientId/companyId must be (non-)null. Derive them from assigneeType so
// callers only specify the assignee, not the bookkeeping columns.
const assigneeColumns = (input: SeedTaskInput) => {
  const { assigneeId, assigneeType } = input
  if (!assigneeId) return { internalUserId: null, clientId: null, companyId: null }
  switch (assigneeType) {
    case AssigneeType.internalUser:
      return { internalUserId: input.internalUserId ?? assigneeId, clientId: null, companyId: null }
    case AssigneeType.client:
      return { internalUserId: null, clientId: input.clientId ?? assigneeId, companyId: input.companyId ?? uuid() }
    case AssigneeType.company:
      return { internalUserId: null, clientId: null, companyId: input.companyId ?? assigneeId }
    default:
      return { internalUserId: null, clientId: null, companyId: null }
  }
}

export const seedTask = async (input: SeedTaskInput): Promise<string> => {
  const id = uuid()
  const workflowStateId = input.workflowStateId ?? (await seedWorkflowState(input.workspaceId))
  await getTestDb().task.create({
    data: {
      id,
      label: `T-${id.slice(0, 8)}`,
      title: input.title ?? 'Reminder task',
      workspaceId: input.workspaceId,
      createdById: input.createdById ?? uuid(),
      workflowStateId,
      assigneeId: input.assigneeId ?? null,
      assigneeType: input.assigneeType ?? null,
      ...assigneeColumns(input),
      dueDate: input.dueDate ?? null,
      assignedAt: input.assignedAtYmd ? noonUtc(input.assignedAtYmd) : null,
      completedAt: input.completedAt ?? null,
      isArchived: input.isArchived ?? false,
      deletedAt: input.deletedAt ?? null,
      parentId: input.parentId ?? null,
    },
  })
  return id
}
