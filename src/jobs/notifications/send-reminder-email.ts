import 'server-only'

import { getReminderEmailDetails } from '@/app/api/notification/notification.helpers'
import { NotificationRequestBody, WorkspaceResponse } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { Task, TaskReminderType } from '@prisma/client'

export type SendReminderEmailArgs = {
  task: Pick<Task, 'id' | 'title' | 'createdById'>
  recipientClientId: string
  recipientCompanyId: string | null
  reminderType: TaskReminderType
  isCompanyRecipient: boolean
  workspace: WorkspaceResponse
  copilot: CopilotAPI
}

/**
 * Dispatches a single task reminder email via Copilot's notification API.
 *
 * Email-only delivery: omits `deliveryTargets.inProduct` so no in-product notification
 * is created. We also deliberately skip writing to `ClientNotification` —
 * `ClientNotification` tracks read-state for in-product notifications, which reminders
 * don't create. Reminder dedupe state lives in `TaskReminderSent`, which the caller
 * inserts on success (the unique constraint is the idempotency primitive).
 *
 * Throws on Copilot failure. Callers compensate by NOT inserting into
 * `TaskReminderSent`, so a future cron run will retry the same `(task, recipient, type)`.
 */
export const sendReminderEmail = async ({
  task,
  recipientClientId,
  recipientCompanyId,
  reminderType,
  isCompanyRecipient,
  workspace,
  copilot,
}: SendReminderEmailArgs): Promise<string> => {
  const details = getReminderEmailDetails(workspace, task, isCompanyRecipient)[reminderType]

  const payload: NotificationRequestBody = {
    senderId: task.createdById,
    senderType: 'internalUser',
    recipientClientId,
    recipientCompanyId: recipientCompanyId ?? undefined,
    deliveryTargets: {
      email: {
        subject: details.subject,
        header: details.header,
        title: details.title,
        body: details.body,
      },
    },
  }

  const notification = await copilot.createNotification(payload)
  return notification.id
}
