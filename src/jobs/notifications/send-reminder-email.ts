import 'server-only'

import { getReminderEmailDetails, REMINDER_ESCALATION_TAG } from '@/app/api/notification/notification.helpers'
import { reminderSubjectOverrideWorkspaces, reminderSubjectSearch, reminderSubjectReplacement } from '@/config'
import { NotificationRequestBody, WorkspaceResponse } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { Task, TaskReminderType } from '@prisma/client'

const MAX_REMINDER_SUBJECT_LENGTH = 120

export type SendReminderEmailArgs = {
  task: Pick<Task, 'id' | 'title' | 'createdById'>
  recipientClientId: string
  recipientCompanyId: string | null
  reminderType: TaskReminderType
  isCompanyRecipient: boolean
  workspace: WorkspaceResponse
  copilot: CopilotAPI
}

const truncateSubject = (subject: string): string => {
  if (subject.length <= MAX_REMINDER_SUBJECT_LENGTH) return subject

  return `${subject.slice(0, MAX_REMINDER_SUBJECT_LENGTH - 3).trimEnd()}...`
}

const buildReminderSubject = ({
  fallbackSubject,
  reminderType,
  taskTitle,
  workspaceId,
}: {
  fallbackSubject: string
  reminderType: TaskReminderType
  taskTitle: string
  workspaceId: string
}): string => {
  if (!reminderSubjectOverrideWorkspaces.has(workspaceId)) return fallbackSubject

  const replacedSubjectTitle = taskTitle
    .replace(reminderSubjectSearch, reminderSubjectReplacement || '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!replacedSubjectTitle || replacedSubjectTitle === reminderSubjectReplacement.trim()) return fallbackSubject

  return truncateSubject(`${REMINDER_ESCALATION_TAG[reminderType]} ${replacedSubjectTitle}`)
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
}: SendReminderEmailArgs): Promise<string> => {
  const details = getReminderEmailDetails(workspace, task, isCompanyRecipient)[reminderType]

  const subject = buildReminderSubject({
    fallbackSubject: details.subject,
    reminderType,
    taskTitle: task.title,
    workspaceId: workspace.id,
  })

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
