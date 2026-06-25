import 'server-only'

import { getReminderEmailDetails, REMINDER_ESCALATION_TAG } from '@/app/api/notification/notification.helpers'
import { reminderSubjectOverrideWorkspaces } from '@/config'
import { NotificationRequestBody, WorkspaceResponse } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { Task, TaskReminderType } from '@prisma/client'

export type SendReminderEmailArgs = {
  task: Pick<Task, 'id' | 'title' | 'createdById'>
  recipientClientId: string
  recipientCompanyId: string | null
  reminderType: TaskReminderType
  isCompanyRecipient: boolean
  workspaceId: string
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
  workspaceId,
  workspace,
  copilot,
}: SendReminderEmailArgs): Promise<string> => {
  const details = getReminderEmailDetails(workspace, task, isCompanyRecipient)[reminderType]

  // For opted-in workspaces, mirror the customized assignment email by using the task title as the
  // subject, prefixed with the escalating cadence tag (OUT-3861).
  const subject = reminderSubjectOverrideWorkspaces.has(workspaceId)
    ? `${REMINDER_ESCALATION_TAG[reminderType]} ${task.title}`
    : details.subject

  const payload: NotificationRequestBody = {
    senderId: task.createdById,
    senderType: 'internalUser',
    recipientClientId,
    recipientCompanyId: recipientCompanyId ?? undefined,
    deliveryTargets: {
      email: {
        subject,
        header: details.header,
        title: details.title,
        body: details.body,
      },
    },
  }

  const notification = await copilot.createNotification(payload)
  return notification.id
}
