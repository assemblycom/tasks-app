import 'server-only'

import { copilotAPIKey } from '@/config'
import { Sentry } from '@/jobs/sentry'
import DBClient from '@/lib/db'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { serializeError } from '@/utils/serializeError'
import { AssigneeType, TaskReminderType } from '@prisma/client'
import { logger, schedules } from '@trigger.dev/sdk/v3'
import Bottleneck from 'bottleneck'

import { dispatchGroupedReminderEmail, DispatchGroupedReminderEmailPayload } from './dispatch-grouped-reminder-email'
import { dispatchReminderEmail, DispatchReminderEmailPayload } from './dispatch-reminder-email'
import { EligibilityRow, getEligibleReminders } from './eligibility'

const WORKSPACE_CONCURRENCY = 5
// Trigger.dev caps batchTrigger at 500 items per call; chunk so a single workspace with
// thousands of fanned-out sends still gets enqueued.
const BATCH_TRIGGER_CHUNK_SIZE = 500

type WorkspaceTotals = { enqueued: number; skipped: number }

type Recipient = { clientId: string; companyId: string }

type LedgerPlanEntry = {
  task: EligibilityRow
  recipient: Recipient
}

export const sendTaskReminders = schedules.task({
  id: 'send-task-reminders',
  cron: '0 0 * * *',
  maxDuration: 3000,
  run: async (payload) => {
    const db = DBClient.getInstance()

    let eligibleTasks: EligibilityRow[]
    try {
      eligibleTasks = await getEligibleReminders(db)
    } catch (err) {
      // A broken eligibility query means zero reminders go out for the day — make it loud.
      // Rethrow so Trigger.dev also marks the run failed; the Sentry event carries the cause.
      Sentry.captureException(err, { tags: { job: 'send-task-reminders', phase: 'eligibility' } })
      logger.error('send-task-reminders: eligibility query failed', { error: serializeError(err) })
      throw err
    }
    const tasks = eligibleTasks.filter((t) => t.assigneeType !== AssigneeType.internalUser)

    const tasksByWorkspace = new Map<string, EligibilityRow[]>()
    for (const task of tasks) {
      const bucket = tasksByWorkspace.get(task.workspaceId)
      if (bucket) bucket.push(task)
      else tasksByWorkspace.set(task.workspaceId, [task])
    }

    logger.log('send-task-reminders: sweep starting', {
      totalEligible: eligibleTasks.length,
      afterIuFilter: tasks.length,
      eligibleWorkspaces: tasksByWorkspace.size,
      workspaceConcurrency: WORKSPACE_CONCURRENCY,
      runAt: payload.timestamp,
    })

    const totals = { enqueued: 0, skipped: 0 }
    let processed = 0
    const workspaceCount = tasksByWorkspace.size

    const workspaceBottleneck = new Bottleneck({ maxConcurrent: WORKSPACE_CONCURRENCY })

    await Promise.allSettled(
      Array.from(tasksByWorkspace.entries()).map(([workspaceId, workspaceTasks]) =>
        workspaceBottleneck.schedule(async () => {
          let wsTotals: WorkspaceTotals = { enqueued: 0, skipped: 0 }
          try {
            wsTotals = await processWorkspace(db, workspaceId, workspaceTasks)
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

    // One greppable structured summary per run. `enqueued`/`skipped` are what this
    // orchestrator can know: it fans out to dispatch-reminder-email rather than sending
    // inline, so per-email sent/failed counts live in that task's Trigger.dev run metrics
    // and its onFailure Sentry capture, not here. `skipped` is ON CONFLICT dedupe, not a failure.
    logger.log('send-task-reminders: run summary', {
      eligibleWorkspaces: workspaceCount,
      totalEligibleTasks: eligibleTasks.length,
      enqueued: totals.enqueued,
      skipped: totals.skipped,
      runAt: payload.timestamp,
    })

    return { ...totals, workspaceCount }
  },
})

const processWorkspace = async (
  db: ReturnType<typeof DBClient.getInstance>,
  workspaceId: string,
  tasks: EligibilityRow[],
): Promise<WorkspaceTotals> => {
  // Workspace-scoped apiKey: empty token + `${workspaceId}/${apiKey}` is accepted by the
  // SDK when COPILOT_ENV is set on the Trigger.dev runtime.
  const copilot = new CopilotAPI('', `${workspaceId}/${copilotAPIKey}`)
  const workspace = await copilot.getWorkspace()

  const plan: LedgerPlanEntry[] = []
  for (const task of tasks) {
    let recipients: Recipient[]
    try {
      recipients = await resolveRecipients(copilot, task)
    } catch (err) {
      // Contain blast radius to this task. Copilot is already wrapped in withRetry, so
      // a thrown error means retries are exhausted — propagating would drop unrelated
      // sibling tasks in the same workspace for the day.
      logger.error('send-task-reminders: failed to resolve recipients, skipping task', {
        workspaceId,
        taskId: task.taskId,
        assigneeType: task.assigneeType,
        assigneeId: task.assigneeId,
        error: serializeError(err),
      })
      continue
    }
    for (const recipient of recipients) {
      plan.push({ task, recipient })
    }
  }

  if (plan.length === 0) return { enqueued: 0, skipped: 0 }

  // Ledger insert before send: the unique constraint is the dedupe primitive.
  const inserted = await db.taskReminderSent.createManyAndReturn({
    data: plan.map((entry) => ({
      taskId: entry.task.taskId,
      workspaceId,
      recipientId: entry.recipient.clientId,
      reminderType: entry.task.reminderType,
    })),
    skipDuplicates: true,
  })

  const insertedKey = (taskId: string, recipientId: string, type: TaskReminderType) => `${taskId}|${recipientId}|${type}`
  const planByKey = new Map<string, LedgerPlanEntry>(
    plan.map((e) => [insertedKey(e.task.taskId, e.recipient.clientId, e.task.reminderType), e]),
  )

  const allTriggers: { payload: DispatchReminderEmailPayload }[] = []
  for (const row of inserted) {
    const entry = planByKey.get(insertedKey(row.taskId, row.recipientId, row.reminderType))
    if (!entry) continue
    allTriggers.push({
      payload: {
        ledgerId: row.id,
        workspaceId,
        task: { id: entry.task.taskId, title: entry.task.title, createdById: entry.task.createdById },
        recipientClientId: entry.recipient.clientId,
        recipientCompanyId: entry.recipient.companyId,
        reminderType: entry.task.reminderType,
        isCompanyRecipient: entry.task.assigneeType === AssigneeType.company,
        workspace,
      },
    })
  }

  // Split by recipient: N=1 → individual email (existing path); N>1 → one grouped email.
  const singleTriggers: { payload: DispatchReminderEmailPayload }[] = []
  const groupedTriggers: { payload: DispatchGroupedReminderEmailPayload }[] = []
  const byRecipient = new Map<string, { payload: DispatchReminderEmailPayload }[]>()
  for (const t of allTriggers) {
    const key = `${t.payload.recipientClientId}|${t.payload.recipientCompanyId ?? ''}`
    const bucket = byRecipient.get(key)
    if (bucket) bucket.push(t)
    else byRecipient.set(key, [t])
  }
  for (const [, recipientTriggers] of byRecipient) {
    if (recipientTriggers.length === 1) {
      singleTriggers.push(recipientTriggers[0])
    } else {
      const first = recipientTriggers[0]
      groupedTriggers.push({
        payload: {
          ledgerIds: recipientTriggers.map((t) => t.payload.ledgerId),
          workspaceId,
          tasks: recipientTriggers.map((t) => ({ taskTitle: t.payload.task.title, reminderType: t.payload.reminderType })),
          recipientClientId: first.payload.recipientClientId,
          recipientCompanyId: first.payload.recipientCompanyId,
          senderId: first.payload.task.createdById,
        },
      })
    }
  }

  const dispatchSingleChunk = async (chunk: { payload: DispatchReminderEmailPayload }[]): Promise<number> => {
    try {
      await dispatchReminderEmail.batchTrigger(chunk)
      return chunk.length
    } catch (err) {
      const ledgerIds = chunk.map((t) => t.payload.ledgerId)
      logger.error('send-task-reminders: batchTrigger (single) failed, compensating ledger', {
        workspaceId,
        chunkSize: chunk.length,
        error: serializeError(err),
      })
      try {
        // Hard delete via raw SQL: the global softDelete extension would rewrite deleteMany()
        // into a deletedAt update, but TaskReminderSents has no such column.
        await db.$executeRaw`DELETE FROM "TaskReminderSents" WHERE id::text = ANY(${ledgerIds})`
      } catch (deleteErr) {
        logger.error('send-task-reminders: ledger compensation delete failed, ledger rows orphaned', {
          workspaceId,
          ledgerIds,
          error: serializeError(deleteErr),
        })
      }
      return 0
    }
  }

  const dispatchGroupedChunk = async (chunk: { payload: DispatchGroupedReminderEmailPayload }[]): Promise<number> => {
    try {
      await dispatchGroupedReminderEmail.batchTrigger(chunk)
      return chunk.reduce((sum, t) => sum + t.payload.ledgerIds.length, 0)
    } catch (err) {
      const ledgerIds = chunk.flatMap((t) => t.payload.ledgerIds)
      logger.error('send-task-reminders: batchTrigger (grouped) failed, compensating ledger', {
        workspaceId,
        chunkSize: chunk.length,
        error: serializeError(err),
      })
      try {
        await db.$executeRaw`DELETE FROM "TaskReminderSents" WHERE id::text = ANY(${ledgerIds})`
      } catch (deleteErr) {
        logger.error('send-task-reminders: ledger compensation delete failed, ledger rows orphaned', {
          workspaceId,
          ledgerIds,
          error: serializeError(deleteErr),
        })
      }
      return 0
    }
  }

  const chunkArray = <T>(arr: T[]) =>
    Array.from({ length: Math.ceil(arr.length / BATCH_TRIGGER_CHUNK_SIZE) }, (_, i) =>
      arr.slice(i * BATCH_TRIGGER_CHUNK_SIZE, (i + 1) * BATCH_TRIGGER_CHUNK_SIZE),
    )

  const enqueuedCounts = await Promise.all([
    ...chunkArray(singleTriggers).map(dispatchSingleChunk),
    ...chunkArray(groupedTriggers).map(dispatchGroupedChunk),
  ])
  const enqueued = enqueuedCounts.reduce((sum, n) => sum + n, 0)

  return { enqueued, skipped: plan.length - inserted.length }
}

// IU rows are filtered upstream so only client/company assignees reach here.
const resolveRecipients = async (copilot: CopilotAPI, task: EligibilityRow): Promise<Recipient[]> => {
  if (task.assigneeType === AssigneeType.company) {
    const members = await copilot.getCompanyClients(task.assigneeId)
    return members.map((m) => ({ clientId: m.id, companyId: task.assigneeId }))
  }

  if (task.companyId) {
    return [{ clientId: task.assigneeId, companyId: task.companyId }]
  }

  const client = await copilot.getClient(task.assigneeId)
  return [{ clientId: task.assigneeId, companyId: client.companyId }]
}
