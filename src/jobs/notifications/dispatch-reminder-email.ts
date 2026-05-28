import 'server-only'

import { copilotAPIKey } from '@/config'
import { Sentry } from '@/jobs/sentry'
import DBClient from '@/lib/db'
import { WorkspaceResponse } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { serializeError } from '@/utils/serializeError'
import { Task, TaskReminderType } from '@prisma/client'
import { logger, task, tasks } from '@trigger.dev/sdk/v3'

import { sendReminderEmail } from './send-reminder-email'

export type DispatchReminderEmailPayload = {
  ledgerId: string
  workspaceId: string
  task: Pick<Task, 'id' | 'title' | 'createdById'>
  recipientClientId: string
  recipientCompanyId: string | null
  reminderType: TaskReminderType
  isCompanyRecipient: boolean
  workspace: WorkspaceResponse
}

const TASK_ID = 'dispatch-reminder-email'

export const dispatchReminderEmailRun = async (payload: DispatchReminderEmailPayload) => {
  const copilot = new CopilotAPI('', `${payload.workspaceId}/${copilotAPIKey}`)
  const notificationId = await sendReminderEmail({
    task: payload.task,
    recipientClientId: payload.recipientClientId,
    recipientCompanyId: payload.recipientCompanyId,
    reminderType: payload.reminderType,
    isCompanyRecipient: payload.isCompanyRecipient,
    workspace: payload.workspace,
    copilot,
  })
  return { ledgerId: payload.ledgerId, notificationId, sent: true as const }
}

// Fires after Trigger.dev exhausts all retries. Compensating here (instead of inside run's
// catch) avoids dropping the ledger row on transient failures a retry would have recovered.
// The SDK types the hook's payload as `unknown`; we cast once via destructure.
export const dispatchReminderEmailOnFailure = async ({ payload, error }: { payload: unknown; error: unknown }) => {
  const { ledgerId, workspaceId, task, recipientClientId, reminderType } = payload as DispatchReminderEmailPayload
  // Terminal send failure (Copilot 500 etc. survived all retries). Capture here, not in
  // run's catch, so transient errors a retry recovers don't generate Sentry noise.
  Sentry.captureException(error, {
    tags: {
      job: 'dispatch-reminder-email',
      taskId: task.id,
      recipientId: recipientClientId,
      reminderType,
      workspaceId,
    },
  })
  logger.error('dispatch-reminder-email: retries exhausted, compensating ledger', {
    ledgerId,
    workspaceId,
    taskId: task.id,
    recipientClientId,
    reminderType,
    error: serializeError(error),
  })
  const db = DBClient.getInstance()
  try {
    // Hard delete via raw SQL: the global softDelete Prisma extension rewrites .delete() into
    // an update that sets deletedAt, but TaskReminderSents has no such column — so .delete()
    // would throw and leave the row, and the unique constraint would then block every future
    // re-send. Raw SQL bypasses the extension so the row truly clears for the next cron run.
    await db.$executeRaw`DELETE FROM "TaskReminderSents" WHERE id::text = ${ledgerId}`
  } catch (deleteErr) {
    logger.error('dispatch-reminder-email: ledger compensation DELETE failed, reminder will not retry', {
      ledgerId,
      error: serializeError(deleteErr),
    })
  }
}

export const dispatchReminderEmail = task({
  id: TASK_ID,
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1_000, maxTimeoutInMs: 15_000, randomize: true },
  maxDuration: 30,
  run: dispatchReminderEmailRun,
})

tasks.onFailure(TASK_ID, dispatchReminderEmailOnFailure)
