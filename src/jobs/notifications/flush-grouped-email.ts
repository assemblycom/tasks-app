import 'server-only'

import { randomUUID } from 'crypto'

import { composeGroupedEmail, GroupedEmailEventInput } from '@/app/api/notification/groupedEmail.composer'
import { copilotAPIKey } from '@/config'
import { Sentry } from '@/jobs/sentry'
import DBClient from '@/lib/db'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { serializeError } from '@/utils/serializeError'
import { logger, task, tasks } from '@trigger.dev/sdk/v3'

import { sendGroupedEmail } from './send-grouped-email'

export type FlushGroupedEmailPayload = {
  workspaceId: string
  windowKey: string
}

type BufferedRow = GroupedEmailEventInput & {
  recipientClientId: string | null
  recipientCompanyId: string | null
}

type RecipientGroup = {
  recipientClientId: string
  recipientCompanyId: string | null
  events: GroupedEmailEventInput[]
}

const TASK_ID = 'flush-grouped-email'

const readUnsentWindowEvents = (db: ReturnType<typeof DBClient.getInstance>, windowKey: string) =>
  db.$queryRaw<BufferedRow[]>`
    SELECT "eventType", "taskId", "taskTitleSnapshot", "createdAt", "recipientClientId", "recipientCompanyId"
    FROM "GroupedEmailEvents"
    WHERE "windowKey" = ${windowKey} AND "sentAt" IS NULL`

const markRecipientSent = (
  db: ReturnType<typeof DBClient.getInstance>,
  windowKey: string,
  recipientClientId: string,
  batchId: string,
) =>
  db.$executeRaw`
    UPDATE "GroupedEmailEvents" SET "sentAt" = now(), "batchId" = ${batchId}::uuid
    WHERE "windowKey" = ${windowKey} AND "recipientClientId" = ${recipientClientId}::uuid AND "sentAt" IS NULL`

const resolveSenderId = async (copilot: CopilotAPI): Promise<string> => {
  const { data } = await copilot.getInternalUsers({ limit: 1 })
  const senderId = data[0]?.id
  if (!senderId) throw new Error('flush-grouped-email: workspace has no internal user to use as sender')
  return senderId
}

const getLiveTaskIds = async (db: ReturnType<typeof DBClient.getInstance>, taskIds: string[]): Promise<Set<string>> => {
  const live = await db.task.findMany({
    where: { id: { in: taskIds }, isArchived: false },
    select: { id: true },
  })
  return new Set(live.map((t) => t.id))
}

const groupByRecipient = (rows: BufferedRow[]): RecipientGroup[] => {
  const groups = new Map<string, RecipientGroup>()
  for (const row of rows) {
    if (!row.recipientClientId) continue
    const group = groups.get(row.recipientClientId)
    const event: GroupedEmailEventInput = {
      eventType: row.eventType,
      taskId: row.taskId,
      taskTitleSnapshot: row.taskTitleSnapshot,
      createdAt: row.createdAt,
    }
    if (group) group.events.push(event)
    else
      groups.set(row.recipientClientId, {
        recipientClientId: row.recipientClientId,
        recipientCompanyId: row.recipientCompanyId,
        events: [event],
      })
  }
  return [...groups.values()]
}

export const flushGroupedEmailRun = async (payload: FlushGroupedEmailPayload) => {
  const { workspaceId, windowKey } = payload
  const db = DBClient.getInstance()
  const batchId = randomUUID()

  const rows = await readUnsentWindowEvents(db, windowKey)
  if (rows.length === 0) {
    logger.log('flush-grouped-email: nothing to send', { workspaceId, windowKey })
    return { windowKey, recipients: 0, sent: 0, skipped: true as const }
  }

  const copilot = new CopilotAPI('', `${workspaceId}/${copilotAPIKey}`)
  const senderId = await resolveSenderId(copilot)

  const liveTaskIds = await getLiveTaskIds(db, [...new Set(rows.map((r) => r.taskId))])

  let sent = 0
  const groups = groupByRecipient(rows)
  for (const group of groups) {
    const content = composeGroupedEmail(group.events.filter((e) => liveTaskIds.has(e.taskId)))
    if (content.sections.length > 0) {
      await sendGroupedEmail({
        content,
        senderId,
        recipientClientId: group.recipientClientId,
        recipientCompanyId: group.recipientCompanyId,
        copilot,
      })
      sent += 1
    }
    await markRecipientSent(db, windowKey, group.recipientClientId, batchId)
  }

  logger.log('flush-grouped-email: run summary', {
    workspaceId,
    windowKey,
    recipients: groups.length,
    sent,
    bufferedEvents: rows.length,
    skippedDeletedTasks: rows.length - rows.filter((r) => liveTaskIds.has(r.taskId)).length,
  })
  return { windowKey, recipients: groups.length, sent }
}

export const flushGroupedEmailOnFailure = async ({ payload, error }: { payload: unknown; error: unknown }) => {
  const { workspaceId, windowKey } = payload as FlushGroupedEmailPayload
  Sentry.captureException(error, { tags: { job: TASK_ID, workspaceId, windowKey } })
  logger.error('flush-grouped-email: retries exhausted', { workspaceId, windowKey, error: serializeError(error) })
}

export const flushGroupedEmail = task({
  id: TASK_ID,
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1_000, maxTimeoutInMs: 15_000, randomize: true },
  maxDuration: 60,
  run: flushGroupedEmailRun,
})

tasks.onFailure(TASK_ID, flushGroupedEmailOnFailure)

export const enqueueGroupedEmailFlush = (payload: FlushGroupedEmailPayload) =>
  flushGroupedEmail.trigger(payload, {
    delay: '5m',
    idempotencyKey: `${payload.workspaceId}:${payload.windowKey}`,
    idempotencyKeyTTL: '10m',
  })
