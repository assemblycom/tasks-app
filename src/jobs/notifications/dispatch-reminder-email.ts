import 'server-only'

import { copilotAPIKey } from '@/config'
import DBClient from '@/lib/db'
import { WorkspaceResponse } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
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

const serializeError = (err: unknown) => (err instanceof Error ? { message: err.message, stack: err.stack } : err)

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
export const dispatchReminderEmailOnFailure = async ({ payload, error }: { payload: unknown; error: unknown }) => {
  const p = payload as DispatchReminderEmailPayload
  logger.error('dispatch-reminder-email: retries exhausted, compensating ledger', {
    ledgerId: p.ledgerId,
    workspaceId: p.workspaceId,
    taskId: p.task.id,
    recipientClientId: p.recipientClientId,
    reminderType: p.reminderType,
    error: serializeError(error),
  })
  const db = DBClient.getInstance()
  try {
    await db.taskReminderSent.delete({ where: { id: p.ledgerId } })
  } catch (deleteErr) {
    logger.error('dispatch-reminder-email: ledger compensation DELETE failed, reminder will not retry', {
      ledgerId: p.ledgerId,
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
