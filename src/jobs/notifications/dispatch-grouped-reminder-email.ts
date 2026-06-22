import 'server-only'

import { copilotAPIKey } from '@/config'
import { Sentry } from '@/jobs/sentry'
import DBClient from '@/lib/db'
import { WorkspaceResponse } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { serializeError } from '@/utils/serializeError'
import { TaskReminderType } from '@prisma/client'
import { logger, task, tasks } from '@trigger.dev/sdk/v3'

import { sendGroupedReminderEmail } from './send-grouped-reminder-email'

export type DispatchGroupedReminderEmailPayload = {
  ledgerIds: string[]
  workspaceId: string
  tasks: { taskTitle: string; reminderType: TaskReminderType }[]
  recipientClientId: string
  recipientCompanyId: string | null
  workspace: WorkspaceResponse
}

const TASK_ID = 'dispatch-grouped-reminder-email'

const resolveSenderId = async (copilot: CopilotAPI): Promise<string> => {
  const { data } = await copilot.getInternalUsers({ limit: 1 })
  const senderId = data[0]?.id
  if (!senderId) throw new Error(`${TASK_ID}: workspace has no internal user to use as sender`)
  return senderId
}

export const dispatchGroupedReminderEmailRun = async (payload: DispatchGroupedReminderEmailPayload) => {
  const copilot = new CopilotAPI('', `${payload.workspaceId}/${copilotAPIKey}`)
  const senderId = await resolveSenderId(copilot)
  const notificationId = await sendGroupedReminderEmail({
    entries: payload.tasks,
    senderId,
    recipientClientId: payload.recipientClientId,
    recipientCompanyId: payload.recipientCompanyId,
    copilot,
  })
  return { ledgerIds: payload.ledgerIds, notificationId, sent: true as const }
}

// Fires after Trigger.dev exhausts all retries. Compensates by hard-deleting all ledger
// rows for this recipient so the next cron run can re-enqueue them.
export const dispatchGroupedReminderEmailOnFailure = async ({ payload, error }: { payload: unknown; error: unknown }) => {
  const { ledgerIds, workspaceId, recipientClientId } = payload as DispatchGroupedReminderEmailPayload
  Sentry.captureException(error, {
    tags: { job: TASK_ID, recipientId: recipientClientId, workspaceId },
  })
  logger.error(`${TASK_ID}: retries exhausted, compensating ledger`, {
    ledgerIds,
    workspaceId,
    recipientClientId,
    error: serializeError(error),
  })
  const db = DBClient.getInstance()
  try {
    // Hard delete via raw SQL: the global softDelete extension would rewrite deleteMany()
    // into a deletedAt update, but TaskReminderSents has no such column.
    await db.$executeRaw`DELETE FROM "TaskReminderSents" WHERE id::text = ANY(${ledgerIds})`
  } catch (deleteErr) {
    logger.error(`${TASK_ID}: ledger compensation DELETE failed, reminders will not retry`, {
      ledgerIds,
      error: serializeError(deleteErr),
    })
  }
}

export const dispatchGroupedReminderEmail = task({
  id: TASK_ID,
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1_000, maxTimeoutInMs: 15_000, randomize: true },
  maxDuration: 30,
  run: dispatchGroupedReminderEmailRun,
})

tasks.onFailure(TASK_ID, dispatchGroupedReminderEmailOnFailure)
