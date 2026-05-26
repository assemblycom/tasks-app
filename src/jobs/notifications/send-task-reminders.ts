import 'server-only'

import { copilotAPIKey } from '@/config'
import DBClient from '@/lib/db'
import { ClientResponse } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { AssigneeType, TaskReminderType } from '@prisma/client'
import { logger, schedules } from '@trigger.dev/sdk/v3'
import Bottleneck from 'bottleneck'

import { dispatchReminderEmail, DispatchReminderEmailPayload } from './dispatch-reminder-email'
import { EligibilityRow, getEligibleReminders } from './eligibility'

const WORKSPACE_CONCURRENCY = 5
// Trigger.dev caps batchTrigger at 500 items per call; chunk so a single workspace with
// thousands of fanned-out sends still gets enqueued.
const BATCH_TRIGGER_CHUNK_SIZE = 500

type WorkspaceTotals = { enqueued: number; skipped: number }

type Recipient = { clientId: string; companyId: string | null }

type LedgerPlanEntry = {
  row: EligibilityRow
  recipient: Recipient
}

export const sendTaskReminders = schedules.task({
  id: 'send-task-reminders',
  cron: '0 0 * * *',
  maxDuration: 3000,
  run: async (payload) => {
    const db = DBClient.getInstance()

    const allRows = await getEligibleReminders(db)
    const rows = allRows.filter((r) => r.assigneeType !== AssigneeType.internalUser)

    const byWorkspace = new Map<string, EligibilityRow[]>()
    for (const row of rows) {
      const bucket = byWorkspace.get(row.workspaceId)
      if (bucket) bucket.push(row)
      else byWorkspace.set(row.workspaceId, [row])
    }

    logger.log('send-task-reminders: sweep starting', {
      totalEligible: allRows.length,
      afterIuFilter: rows.length,
      eligibleWorkspaces: byWorkspace.size,
      workspaceConcurrency: WORKSPACE_CONCURRENCY,
      runAt: payload.timestamp,
    })

    const totals = { enqueued: 0, skipped: 0 }
    let processed = 0
    const workspaceCount = byWorkspace.size

    const workspaceBottleneck = new Bottleneck({ maxConcurrent: WORKSPACE_CONCURRENCY })

    await Promise.allSettled(
      Array.from(byWorkspace.entries()).map(([workspaceId, workspaceRows]) =>
        workspaceBottleneck.schedule(async () => {
          let wsTotals: WorkspaceTotals = { enqueued: 0, skipped: 0 }
          try {
            wsTotals = await processWorkspace(db, workspaceId, workspaceRows)
          } catch (err) {
            logger.error('send-task-reminders: workspace failed', {
              workspaceId,
              error: serializeError(err),
            })
          } finally {
            totals.enqueued += wsTotals.enqueued
            totals.skipped += wsTotals.skipped
            processed += 1
            logger.log(
              `[${processed}/${workspaceCount}] workspace ${workspaceId}: enqueued ${wsTotals.enqueued}, skipped ${wsTotals.skipped}`,
              { workspaceId, ...wsTotals, processed, eligibleWorkspaces: workspaceCount },
            )
          }
        }),
      ),
    )

    logger.log('send-task-reminders: sweep complete', {
      ...totals,
      workspaceCount,
      totalEligible: allRows.length,
    })

    return { ...totals, workspaceCount }
  },
})

const processWorkspace = async (
  db: ReturnType<typeof DBClient.getInstance>,
  workspaceId: string,
  rows: EligibilityRow[],
): Promise<WorkspaceTotals> => {
  // Workspace-scoped apiKey: empty token + `${workspaceId}/${apiKey}` is accepted by the
  // SDK when COPILOT_ENV is set on the Trigger.dev runtime.
  const copilot = new CopilotAPI('', `${workspaceId}/${copilotAPIKey}`)
  const workspace = await copilot.getWorkspace()

  const plan: LedgerPlanEntry[] = []
  for (const row of rows) {
    const recipients = await resolveRecipients(copilot, row)
    for (const recipient of recipients) {
      plan.push({ row, recipient })
    }
  }

  if (plan.length === 0) return { enqueued: 0, skipped: 0 }

  // Ledger insert before send: the unique constraint is the dedupe primitive.
  const inserted = await db.taskReminderSent.createManyAndReturn({
    data: plan.map((entry) => ({
      taskId: entry.row.taskId,
      workspaceId,
      recipientId: entry.recipient.clientId,
      reminderType: entry.row.reminderType,
    })),
    skipDuplicates: true,
  })

  const insertedKey = (taskId: string, recipientId: string, type: TaskReminderType) => `${taskId}|${recipientId}|${type}`
  const planByKey = new Map<string, LedgerPlanEntry>(
    plan.map((e) => [insertedKey(e.row.taskId, e.recipient.clientId, e.row.reminderType), e]),
  )

  const triggers: { payload: DispatchReminderEmailPayload }[] = []
  for (const row of inserted) {
    const entry = planByKey.get(insertedKey(row.taskId, row.recipientId, row.reminderType))
    if (!entry) continue
    triggers.push({
      payload: {
        ledgerId: row.id,
        workspaceId,
        task: { id: entry.row.taskId, title: entry.row.title, createdById: entry.row.createdById },
        recipientClientId: entry.recipient.clientId,
        recipientCompanyId: entry.recipient.companyId,
        reminderType: entry.row.reminderType,
        isCompanyRecipient: entry.row.assigneeType === AssigneeType.company,
        workspace,
      },
    })
  }

  let enqueued = 0
  for (let i = 0; i < triggers.length; i += BATCH_TRIGGER_CHUNK_SIZE) {
    const chunk = triggers.slice(i, i + BATCH_TRIGGER_CHUNK_SIZE)
    try {
      await dispatchReminderEmail.batchTrigger(chunk)
      enqueued += chunk.length
    } catch (err) {
      // Compensate: drop the chunk's ledger rows so the next cron run retries them.
      // Without this, the rows are orphans: the unique constraint blocks future inserts
      // but no dispatcher will ever consume them.
      const ledgerIds = chunk.map((t) => t.payload.ledgerId)
      logger.error('send-task-reminders: batchTrigger failed, compensating ledger', {
        workspaceId,
        chunkSize: chunk.length,
        chunkOffset: i,
        error: serializeError(err),
      })
      try {
        await db.taskReminderSent.deleteMany({ where: { id: { in: ledgerIds } } })
      } catch (deleteErr) {
        logger.error('send-task-reminders: ledger compensation deleteMany failed, ledger rows orphaned', {
          workspaceId,
          ledgerIds,
          error: serializeError(deleteErr),
        })
      }
    }
  }

  return { enqueued, skipped: plan.length - inserted.length }
}

const resolveRecipients = async (copilot: CopilotAPI, row: EligibilityRow): Promise<Recipient[]> => {
  if (row.assigneeType === AssigneeType.client) {
    return [{ clientId: row.assigneeId, companyId: row.companyId }]
  }
  if (row.assigneeType === AssigneeType.company) {
    const members: ClientResponse[] = await copilot.getCompanyClients(row.assigneeId)
    return members.map((m) => ({ clientId: m.id, companyId: row.assigneeId }))
  }
  return []
}

const serializeError = (err: unknown) => (err instanceof Error ? { message: err.message, stack: err.stack } : err)
