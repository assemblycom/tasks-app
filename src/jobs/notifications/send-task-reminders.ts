import 'server-only'

import { copilotAPIKey } from '@/config'
import DBClient from '@/lib/db'
import { ClientResponse } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { AssigneeType, TaskReminderType } from '@prisma/client'
import { logger, schedules } from '@trigger.dev/sdk/v3'
import Bottleneck from 'bottleneck'

import { EligibilityRow, getEligibleReminders } from './eligibility'
import { sendReminderEmail } from './send-reminder-email'

const WORKSPACE_CONCURRENCY = 5

type WorkspaceTotals = { sent: number; failed: number; skipped: number }

type TaskInfo = { id: string; title: string; createdById: string }

type Recipient = { clientId: string; companyId: string | null }

type LedgerPlanEntry = {
  row: EligibilityRow
  task: TaskInfo
  recipient: Recipient
}

export const sendTaskReminders = schedules.task({
  id: 'send-task-reminders',
  cron: '0 0 * * *',
  maxDuration: 3000,
  run: async (payload) => {
    const db = DBClient.getInstance()

    const allRows = await getEligibleReminders(db)
    // IUs are deliberately excluded from reminder emails — see EligibilityRow typedoc
    // in ./eligibility.ts. The eligibility SQL still emits IU rows for symmetry; the
    // filter lives here so OUT-3736's contract stays untouched.
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

    const totals = { sent: 0, failed: 0, skipped: 0 }
    let processed = 0
    const workspaceCount = byWorkspace.size

    const workspaceBottleneck = new Bottleneck({ maxConcurrent: WORKSPACE_CONCURRENCY })

    await Promise.allSettled(
      Array.from(byWorkspace.entries()).map(([workspaceId, workspaceRows]) =>
        workspaceBottleneck.schedule(async () => {
          let wsTotals: WorkspaceTotals = { sent: 0, failed: 0, skipped: 0 }
          try {
            wsTotals = await processWorkspace(db, workspaceId, workspaceRows)
          } catch (err) {
            // Per-workspace isolation: one bad workspace shouldn't abort the sweep.
            logger.error('send-task-reminders: workspace failed', {
              workspaceId,
              error: serializeError(err),
            })
          } finally {
            totals.sent += wsTotals.sent
            totals.failed += wsTotals.failed
            totals.skipped += wsTotals.skipped
            processed += 1
            logger.log(
              `[${processed}/${workspaceCount}] workspace ${workspaceId}: sent ${wsTotals.sent}, failed ${wsTotals.failed}, skipped ${wsTotals.skipped}`,
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
  // Fetch the task fields we need that aren't on EligibilityRow (title, createdById).
  // Kept here rather than in eligibility.ts to leave OUT-3736's contract intact.
  const taskIds = Array.from(new Set(rows.map((r) => r.taskId)))
  const tasks = await db.task.findMany({
    where: { id: { in: taskIds } },
    select: { id: true, title: true, createdById: true },
  })
  if (tasks.length === 0) return { sent: 0, failed: 0, skipped: 0 }
  const taskById = new Map<string, TaskInfo>(tasks.map((t) => [t.id, t]))

  // Per-workspace Copilot client using a workspace-scoped apiKey. The SDK patch
  // (src/lib/patch-copilot-node-sdk.js) accepts `${workspaceId}/${apiKey}` as the auth key
  // directly when COPILOT_ENV is set on the Trigger.dev runtime (`local` for prod,
  // `__SECRET_STAGING__` for staging) — no user token needed. Empty token = no user context.
  const copilot = new CopilotAPI('', `${workspaceId}/${copilotAPIKey}`)
  const workspace = await copilot.getWorkspace()

  // Plan: fan out company rows to one entry per current member; client rows stay 1:1.
  // Members no longer in the company are filtered naturally — they don't come back from
  // getCompanyClients, per OUT-3736 ticket.
  const plan: LedgerPlanEntry[] = []
  for (const row of rows) {
    const task = taskById.get(row.taskId)
    if (!task) continue
    const recipients = await resolveRecipients(copilot, row)
    for (const recipient of recipients) {
      plan.push({ row, task, recipient })
    }
  }

  if (plan.length === 0) return { sent: 0, failed: 0, skipped: 0 }

  // Ledger insert is the idempotency boundary. `skipDuplicates: true` compiles to
  // `ON CONFLICT DO NOTHING` against the (taskId, recipientId, reminderType) unique
  // constraint, so a retried cron run cannot double-send. `createManyAndReturn` only
  // returns the rows that actually got inserted — duplicates skipped by ON CONFLICT
  // are absent from the result, which is precisely the "net-new to send" list.
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
  const insertedById = new Map(inserted.map((r) => [insertedKey(r.taskId, r.recipientId, r.reminderType), r.id]))

  const skipped = plan.length - inserted.length

  let sent = 0
  let failed = 0

  for (const entry of plan) {
    const ledgerId = insertedById.get(insertedKey(entry.row.taskId, entry.recipient.clientId, entry.row.reminderType))
    if (!ledgerId) continue // already-sent (ON CONFLICT skipped this one)

    try {
      await sendReminderEmail({
        task: entry.task,
        recipientClientId: entry.recipient.clientId,
        recipientCompanyId: entry.recipient.companyId,
        reminderType: entry.row.reminderType,
        isCompanyRecipient: entry.row.assigneeType === AssigneeType.company,
        workspace,
        copilot,
      })
      sent += 1
    } catch (err) {
      // Compensate: drop the ledger row so the next cron run retries this (task, recipient, type).
      // If the DELETE itself fails the row stays in the ledger and we won't retry — that's
      // a permanent miss, logged distinctly so on-call can clean up.
      failed += 1
      logger.error('send-task-reminders: Copilot send failed, compensating ledger', {
        workspaceId,
        taskId: entry.row.taskId,
        recipientClientId: entry.recipient.clientId,
        reminderType: entry.row.reminderType,
        error: serializeError(err),
      })
      try {
        await db.taskReminderSent.delete({ where: { id: ledgerId } })
      } catch (deleteErr) {
        logger.error('send-task-reminders: ledger compensation DELETE failed, reminder will not retry', {
          workspaceId,
          ledgerId,
          taskId: entry.row.taskId,
          recipientClientId: entry.recipient.clientId,
          reminderType: entry.row.reminderType,
          error: serializeError(deleteErr),
        })
      }
    }
  }

  return { sent, failed, skipped }
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
