import 'server-only'

import { randomUUID } from 'crypto'

import { composeGroupedEmail, GroupedEmailEventInput } from '@/app/api/notification/groupedEmail.composer'
import { copilotAPIKey } from '@/config'
import { Sentry } from '@/jobs/sentry'
import DBClient from '@/lib/db'
import { NotificationRequestBody } from '@/types/common'
import { isMessagableError } from '@/utils/copilotError'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { serializeError } from '@/utils/serializeError'
import { logger, task, tasks } from '@trigger.dev/sdk/v3'

import { sendGroupedEmail } from './send-grouped-email'

export type FlushGroupedEmailPayload = {
  workspaceId: string
  windowKey: string
}

type WindowEvent = GroupedEmailEventInput & { individualEmail: NotificationRequestBody | null }

type BufferedRow = WindowEvent & {
  recipientClientId: string | null
  recipientCompanyId: string | null
  recipientIuId: string | null
}

type CuRecipientGroup = {
  recipientClientId: string
  recipientCompanyId: string | null
  events: WindowEvent[]
}

type IuRecipientGroup = {
  recipientIuId: string
  events: WindowEvent[]
}

const TASK_ID = 'flush-grouped-email'

const readUnsentWindowEvents = (db: ReturnType<typeof DBClient.getInstance>, windowKey: string) =>
  db.$queryRaw<BufferedRow[]>`
    SELECT "eventType", "taskId", "taskTitleSnapshot", "createdAt", "recipientClientId", "recipientCompanyId", "recipientIuId", "individualEmail"
    FROM "GroupedEmailEvents"
    WHERE "windowKey" = ${windowKey} AND "sentAt" IS NULL`

const deleteWindowRows = (db: ReturnType<typeof DBClient.getInstance>, windowKey: string) =>
  db.$executeRaw`DELETE FROM "GroupedEmailEvents" WHERE "windowKey" = ${windowKey} AND "sentAt" IS NOT NULL`

const markCuRecipientSent = (
  db: ReturnType<typeof DBClient.getInstance>,
  windowKey: string,
  recipientClientId: string,
  batchId: string,
) =>
  db.$executeRaw`
    UPDATE "GroupedEmailEvents" SET "sentAt" = now(), "batchId" = ${batchId}::uuid
    WHERE "windowKey" = ${windowKey} AND "recipientClientId" = ${recipientClientId}::uuid AND "sentAt" IS NULL`

const markIuRecipientSent = (
  db: ReturnType<typeof DBClient.getInstance>,
  windowKey: string,
  recipientIuId: string,
  batchId: string,
) =>
  db.$executeRaw`
    UPDATE "GroupedEmailEvents" SET "sentAt" = now(), "batchId" = ${batchId}::uuid
    WHERE "windowKey" = ${windowKey} AND "recipientIuId" = ${recipientIuId}::uuid AND "sentAt" IS NULL`

const resolveSenderId = async (copilot: CopilotAPI): Promise<string> => {
  const { data } = await copilot.getInternalUsers({ limit: 1 })
  const senderId = data[0]?.id
  if (!senderId) throw new Error('flush-grouped-email: workspace has no internal user to use as sender')
  return senderId
}

// Copilot only emails an IU recipient when the sender is a real participant, so attribute the
// grouped summary to the actual actor from the buffered events, not an arbitrary workspace IU.
const senderFromEvents = (events: WindowEvent[]): string | undefined =>
  events.map((e) => e.individualEmail?.senderId).find((id): id is string => Boolean(id))

const sendIndividualEmail = async (copilot: CopilotAPI, payload: NotificationRequestBody): Promise<void> => {
  try {
    await copilot.createNotification(payload)
  } catch (e: unknown) {
    // Account for workspaces without multi-companies, which reject senderCompanyId (mirrors NotificationService).
    if (isMessagableError(e) && e.body?.message === 'sender company ID is invalid based on sender') {
      await copilot.createNotification({ ...payload, senderCompanyId: undefined })
    } else {
      throw e
    }
  }
}

const getLiveTaskIds = async (db: ReturnType<typeof DBClient.getInstance>, taskIds: string[]): Promise<Set<string>> => {
  const live = await db.task.findMany({
    where: { id: { in: taskIds }, isArchived: false },
    select: { id: true },
  })
  return new Set(live.map((t) => t.id))
}

const toWindowEvent = (row: BufferedRow): WindowEvent => ({
  eventType: row.eventType,
  taskId: row.taskId,
  taskTitleSnapshot: row.taskTitleSnapshot,
  createdAt: row.createdAt,
  individualEmail: row.individualEmail,
})

const groupCuRecipients = (rows: BufferedRow[]): CuRecipientGroup[] => {
  const groups = new Map<string, CuRecipientGroup>()
  for (const row of rows) {
    if (!row.recipientClientId) continue
    const group = groups.get(row.recipientClientId)
    if (group) group.events.push(toWindowEvent(row))
    else
      groups.set(row.recipientClientId, {
        recipientClientId: row.recipientClientId,
        recipientCompanyId: row.recipientCompanyId,
        events: [toWindowEvent(row)],
      })
  }
  return [...groups.values()]
}

const groupIuRecipients = (rows: BufferedRow[]): IuRecipientGroup[] => {
  const groups = new Map<string, IuRecipientGroup>()
  for (const row of rows) {
    if (!row.recipientIuId) continue
    const group = groups.get(row.recipientIuId)
    if (group) group.events.push(toWindowEvent(row))
    else groups.set(row.recipientIuId, { recipientIuId: row.recipientIuId, events: [toWindowEvent(row)] })
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

  const liveTaskIds = await getLiveTaskIds(db, [...new Set(rows.map((r) => r.taskId))])
  const skippedDeletedTasks = rows.length - rows.filter((r) => liveTaskIds.has(r.taskId)).length

  const cuGroups = groupCuRecipients(rows)
  const iuGroups = groupIuRecipients(rows)
  logger.log('flush-grouped-email: starting', {
    workspaceId,
    windowKey,
    bufferedEvents: rows.length,
    skippedDeletedTasks,
    recipients: cuGroups.length + iuGroups.length,
  })

  let sent = 0
  let sentGrouped = 0
  let sentIndividual = 0
  let senderId: string | undefined // resolved lazily — only the grouped branch needs a workspace IU

  for (const group of cuGroups) {
    const liveEvents = group.events.filter((e) => liveTaskIds.has(e.taskId))
    // A single event reads awkwardly as a "summary" — replay the original individual email verbatim.
    // Pre-migration rows have no snapshot; fall back to the grouped summary rather than crash.
    const singleEmail = liveEvents.length === 1 ? liveEvents[0].individualEmail : null

    Sentry.addBreadcrumb({
      category: 'flush-grouped-email',
      message: `cu recipient ${group.recipientClientId}`,
      data: { workspaceId, windowKey, recipientClientId: group.recipientClientId, liveEvents: liveEvents.length },
    })

    if (singleEmail) {
      await sendIndividualEmail(copilot, singleEmail)
      sent += 1
      sentIndividual += 1
    } else if (liveEvents.length >= 1) {
      const groupSenderId = senderFromEvents(liveEvents) ?? (senderId ??= await resolveSenderId(copilot))
      await sendGroupedEmail({
        content: composeGroupedEmail(liveEvents),
        senderId: groupSenderId,
        recipientClientId: group.recipientClientId,
        recipientCompanyId: group.recipientCompanyId,
        copilot,
      })
      sent += 1
      sentGrouped += 1
    }

    await markCuRecipientSent(db, windowKey, group.recipientClientId, batchId)
    logger.log('flush-grouped-email: recipient processed', {
      workspaceId,
      windowKey,
      recipientClientId: group.recipientClientId,
      liveEvents: liveEvents.length,
      outcome: singleEmail ? ('individual' as const) : liveEvents.length >= 1 ? ('grouped' as const) : ('skipped' as const),
    })
  }

  for (const group of iuGroups) {
    const liveEvents = group.events.filter((e) => liveTaskIds.has(e.taskId))
    const singleEmail = liveEvents.length === 1 ? liveEvents[0].individualEmail : null

    Sentry.addBreadcrumb({
      category: 'flush-grouped-email',
      message: `iu recipient ${group.recipientIuId}`,
      data: { workspaceId, windowKey, recipientIuId: group.recipientIuId, liveEvents: liveEvents.length },
    })

    if (singleEmail) {
      await sendIndividualEmail(copilot, singleEmail)
      sent += 1
      sentIndividual += 1
    } else if (liveEvents.length >= 1) {
      const groupSenderId = senderFromEvents(liveEvents) ?? (senderId ??= await resolveSenderId(copilot))
      await sendGroupedEmail({
        content: composeGroupedEmail(liveEvents),
        senderId: groupSenderId,
        recipientInternalUserId: group.recipientIuId,
        copilot,
      })
      sent += 1
      sentGrouped += 1
    }

    await markIuRecipientSent(db, windowKey, group.recipientIuId, batchId)
    logger.log('flush-grouped-email: recipient processed', {
      workspaceId,
      windowKey,
      recipientIuId: group.recipientIuId,
      liveEvents: liveEvents.length,
      outcome: singleEmail ? ('individual' as const) : liveEvents.length >= 1 ? ('grouped' as const) : ('skipped' as const),
    })
  }

  try {
    await deleteWindowRows(db, windowKey)
  } catch (err) {
    logger.error('flush-grouped-email: window cleanup failed, rows left with sentAt set', {
      workspaceId,
      windowKey,
      error: serializeError(err),
    })
  }

  logger.log('flush-grouped-email: run summary', {
    workspaceId,
    windowKey,
    recipients: cuGroups.length + iuGroups.length,
    sent,
    sentGrouped,
    sentIndividual,
    bufferedEvents: rows.length,
    skippedDeletedTasks,
  })
  return { windowKey, recipients: cuGroups.length + iuGroups.length, sent, sentGrouped, sentIndividual }
}

export const flushGroupedEmailOnFailure = async ({ payload, error }: { payload: unknown; error: unknown }) => {
  const { workspaceId, windowKey } = payload as FlushGroupedEmailPayload
  Sentry.captureException(error, { tags: { job: TASK_ID, workspaceId, windowKey } })
  logger.error('flush-grouped-email: retries exhausted, cleaning up window', {
    workspaceId,
    windowKey,
    error: serializeError(error),
  })
  const db = DBClient.getInstance()
  try {
    await db.$executeRaw`DELETE FROM "GroupedEmailEvents" WHERE "windowKey" = ${windowKey}`
  } catch (deleteErr) {
    logger.error('flush-grouped-email: window cleanup on failure failed, rows are orphaned', {
      workspaceId,
      windowKey,
      error: serializeError(deleteErr),
    })
  }
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
