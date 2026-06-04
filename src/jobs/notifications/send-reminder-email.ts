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

// Email-only: omits deliveryTargets.inProduct and does not write to ClientNotification.
// Reminder dedupe lives in TaskReminderSent (caller's responsibility).
export const sendReminderEmail = async ({
  task,
  recipientClientId,
  recipientCompanyId,
  reminderType,
  isCompanyRecipient,
  workspace,
  copilot,
}: SendReminderEmailArgs): Promise<string | null> => {
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
  return notification?.id ?? null
}
