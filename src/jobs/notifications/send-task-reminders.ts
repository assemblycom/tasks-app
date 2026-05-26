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
  task: EligibilityRow
  recipient: Recipient
}

export const sendTaskReminders = schedules.task({
  id: 'send-task-reminders',
  cron: '0 0 * * *',
  maxDuration: 3000,
  run: async (payload) => {
    const db = DBClient.getInstance()

    const eligibleTasks = await getEligibleReminders(db)
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

    logger.log('send-task-reminders: sweep complete', {
      ...totals,
      workspaceCount,
      totalEligible: eligibleTasks.length,
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

  const triggers: { payload: DispatchReminderEmailPayload }[] = []
  for (const row of inserted) {
    const entry = planByKey.get(insertedKey(row.taskId, row.recipientId, row.reminderType))
    if (!entry) continue
    triggers.push({
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

const resolveRecipients = async (copilot: CopilotAPI, task: EligibilityRow): Promise<Recipient[]> => {
  if (task.assigneeType === AssigneeType.client) {
    return [{ clientId: task.assigneeId, companyId: task.companyId }]
  }
  if (task.assigneeType === AssigneeType.company) {
    const members: ClientResponse[] = await copilot.getCompanyClients(task.assigneeId)
    return members.map((m) => ({ clientId: m.id, companyId: task.assigneeId }))
  }
  return []
}

const serializeError = (err: unknown) => (err instanceof Error ? { message: err.message, stack: err.stack } : err)
