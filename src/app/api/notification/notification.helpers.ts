import { EmailNotificationDetails, WorkspaceResponse } from '@/types/common'
import { getWorkspaceLabels } from '@/utils/getWorkspaceLabels'
import { NotificationTaskActions } from '@api/core/types/tasks'
import { Task, TaskReminderType } from '@prisma/client'

type EmailDetailWithCta = EmailNotificationDetails & { ctaParams?: Record<string, string> }

/**
 * Merges a caller-supplied email override onto the default template email.
 *
 * When the override carries an `htmlBody`, the default template `body` is dropped unless the caller
 * explicitly provided one — a leftover plain-text body shadows the HTML in the delivered email.
 */
export const mergeEmailOverride = ({
  base,
  override,
}: {
  base: EmailDetailWithCta
  override?: EmailNotificationDetails
}): EmailDetailWithCta => {
  if (!override) return base
  const merged: EmailDetailWithCta = { ...base, ...override }
  if (override.htmlBody && !override.body) delete merged.body
  return merged
}

/**
 * Helper function that sets the in-product notification title and body for a given notification trigger
 * @param {WorkspaceResponse} workspace - Current workspace to extract labels from the workspace
 * @param {string} actionUser - The user's name that triggered this action.
 * @param {Task} [task] - The task for which the mention is triggered.
 * @param {{companyName?: string, commentId?: string}} [opts] - Opts for optional notification fields
 * @returns {Object} An object with notification actions as keys and their corresponding title and body as values.
 * @returns {Object.<NotificationTaskActions, {title: string, body: string}>} - The notification details.
 */
export const getInProductNotificationDetails = (
  workspace: WorkspaceResponse,
  actionUser: string,
  task?: Task,
  opts?: {
    companyName?: string
    commentId?: string
  },
): { [key in NotificationTaskActions]: { title: string; body: string; ctaParams?: Record<string, unknown> } } => {
  const ctaParams =
    task || opts?.commentId
      ? {
          ...(task && { taskId: task.id }),
          ...(opts?.commentId && { commentId: opts?.commentId }),
        }
      : undefined

  const commentDetail = {
    title: 'Comment was added',
    body: `${actionUser} left a comment on the task ‘${task?.title}’.`,
    ctaParams,
  }

  return {
    [NotificationTaskActions.Assigned]: {
      title: 'Task was assigned to you',
      body: `The task ‘${task?.title}’  was created and assigned to you by ${actionUser}. To see details about the task, navigate to the Tasks App below.`,
      ctaParams,
    },
    [NotificationTaskActions.AssignedToCompany]: {
      title: `Task was assigned to your ${getWorkspaceLabels(workspace).groupTerm}`,
      body: `A new task ‘${task?.title}’ was assigned to your ${getWorkspaceLabels(workspace).groupTerm} by ${actionUser}. To see details about the task, navigate to the Tasks App below.`,
    },

    [NotificationTaskActions.ReassignedToIU]: {
      title: 'Task was reassigned to you',
      body: `The task ‘${task?.title}’ was reassigned to you by ${actionUser}. To see details about the task, navigate to the Tasks App below.`,
      ctaParams,
    },
    [NotificationTaskActions.ReassignedToClient]: {
      title: 'View task',
      body: `The task ‘${task?.title}’ was reassigned to you by ${actionUser}. To see details about the task open it below.`,
      ctaParams,
    },
    [NotificationTaskActions.ReassignedToCompany]: {
      title: 'View task',
      body: `The task ‘${task?.title}’ was reassigned to your ${getWorkspaceLabels(workspace).groupTerm} by ${actionUser}. To see details about the task open it below.`,
      ctaParams,
    },

    [NotificationTaskActions.CompletedByCompanyMember]: {
      title: 'Task was completed',
      body: `The task ‘${task?.title}’ was completed by ${actionUser} for ${opts?.companyName}.`,
      ctaParams,
    },
    [NotificationTaskActions.CompletedForCompanyByIU]: {
      title: 'Task was completed',
      body: `The task ‘${task?.title}’ was completed by ${actionUser} for ${opts?.companyName}.`,
      ctaParams,
    },
    [NotificationTaskActions.Completed]: {
      title: 'Task was completed',
      body: `The task ‘${task?.title}’ was completed by ${actionUser}.`,
      ctaParams,
    },
    [NotificationTaskActions.CompletedByIU]: {
      title: 'Task was completed',
      body: `The task ‘${task?.title}’ was completed by ${actionUser}.`,
      ctaParams,
    },
    [NotificationTaskActions.CompletedToSharedCU]: {
      title: 'A task has been completed',
      body: `The task ‘${task?.title}’ has been marked as done by ${actionUser}.`,
      ctaParams,
    },
    [NotificationTaskActions.CompletedToSharedCompany]: {
      title: 'A task has been completed',
      body: `The task ‘${task?.title}’ has been marked as done by ${actionUser}.`,
      ctaParams,
    },

    [NotificationTaskActions.Commented]: commentDetail,
    [NotificationTaskActions.CommentToCU]: commentDetail,
    [NotificationTaskActions.CommentToIU]: commentDetail,
    [NotificationTaskActions.Mentioned]: {
      title: 'You were mentioned in a task comment',
      body: `You were mentioned in a comment on task ‘${task?.title}’ by ${actionUser}. To see details about the task, navigate to the Tasks App below. `,
      ctaParams,
    },
    [NotificationTaskActions.Shared]: {
      title: `A task has been shared with you`,
      body: `${actionUser} shared the task '${task?.title}'. View the task below to see updates and leave comments.`,
      ctaParams,
    },
    [NotificationTaskActions.SharedToCompany]: {
      title: `A task has been shared with you`,
      body: `${actionUser} shared the task '${task?.title}'. View the task below to see updates and leave comments.`,
      ctaParams,
    },
  }
}

/**
 * Helper function that sets the notification email details for a given notification trigger.
 * @param {string} actionUser - The user's name that triggered this action.
 * @param {Task} [task] - The task for which the mention is triggered.
 * @param {{commentId?: string}} [opts] - Opts for optional notification fields
 * @returns {object} - The email notification details.
 */
export const getEmailDetails = (
  workspace: WorkspaceResponse,
  actionUser: string,
  task?: Task,
  opts?: {
    commentId?: string
  },
): Partial<{
  [key in NotificationTaskActions]: {
    title: string
    subject: string
    header: string
    body: string
    ctaParams?: Record<string, string>
  }
}> => {
  const ctaParams =
    task || opts?.commentId
      ? {
          ...(task && { taskId: task.id }),
          ...(opts?.commentId && { commentId: opts?.commentId }),
        }
      : undefined

  return {
    [NotificationTaskActions.Assigned]: {
      subject: 'A task was assigned to you',
      header: 'A task was assigned to you',
      body: `The task ‘${task?.title}’ was assigned to you by ${actionUser}. To see details about the task, open it below.`,
      title: 'View task',
      ctaParams,
    },
    [NotificationTaskActions.AssignedToCompany]: {
      subject: `Task was assigned to your ${getWorkspaceLabels(workspace).groupTerm}`,
      header: `Task was assigned to your ${getWorkspaceLabels(workspace).groupTerm}`,
      body: `A new task ‘${task?.title}’ was assigned to your ${getWorkspaceLabels(workspace).groupTerm} by ${actionUser}. To see details about the task, open it below.`,
      title: 'View task',
      ctaParams,
    },
    //! Currently disable all IU email notifications
    // [NotificationTaskActions.Completed]: {
    //   title: 'A client completed a task',
    //   subject: 'A client completed a task',
    //   header: 'A client completed a task',
    //   body: `A new task was completed by ${actionUser}. You are receiving this notification because you have access to the client.`,
    // },
    [NotificationTaskActions.Commented]: {
      subject: 'Comment was added',
      header: 'Comment was added',
      body: `${actionUser} left a comment on the task ‘${task?.title}’. To view the comment, open the task below.`,
      title: 'View comment',
      ctaParams,
    },
    [NotificationTaskActions.Mentioned]: {
      subject: 'You were mentioned in a task comment',
      header: 'You were mentioned in a task comment',
      body: `You were mentioned in a comment on task ‘${task?.title}’ by ${actionUser}. To see details about the task, navigate to the Tasks App below. `,
      title: 'View task',
      ctaParams,
    },
    [NotificationTaskActions.ReassignedToClient]: {
      subject: 'A task was reassigned to you',
      header: 'A task was reassigned to you',
      title: 'View task',
      body: `The task ‘${task?.title}’ was reassigned to you by ${actionUser}. To see details about the task open it below.`,
      ctaParams,
    },
    [NotificationTaskActions.ReassignedToCompany]: {
      subject: `A task was reassigned to your ${getWorkspaceLabels(workspace).groupTerm}`,
      header: `A task was reassigned to your ${getWorkspaceLabels(workspace).groupTerm}`,
      title: 'View task',
      body: `The task ‘${task?.title}’ was reassigned to your ${getWorkspaceLabels(workspace).groupTerm} by ${actionUser}. To see details about the task open it below.`,
      ctaParams,
    },
    [NotificationTaskActions.Shared]: {
      subject: `A task has been shared with you`,
      header: `A task was shared with you by ${actionUser}`,
      title: 'View task',
      body: `${actionUser} shared the task '${task?.title}'. View the task below to see updates and leave comments.`,
      ctaParams,
    },
    [NotificationTaskActions.CompletedToSharedCU]: {
      subject: 'Task marked as done',
      header: 'A task has been completed',
      title: 'View task',
      body: `The task ‘${task?.title}’ has been marked as done by ${actionUser}.\n\nTo see details about the task, open it below.`,
      ctaParams,
    },
    [NotificationTaskActions.CompletedToSharedCompany]: {
      subject: 'Task marked as done',
      header: 'A task has been completed',
      title: 'View task',
      body: `The task ‘${task?.title}’ has been marked as done by ${actionUser}.\n\nTo see details about the task, open it below.`,
      ctaParams,
    },
    [NotificationTaskActions.SharedToCompany]: {
      subject: `A task has been shared with you`,
      header: `A task was shared with you by ${actionUser}`,
      title: 'View task',
      body: `${actionUser} shared the task '${task?.title}'. View the task below to see updates and leave comments.`,
      ctaParams,
    },
  }
}

// Escalating cadence tag prefixed to the subject line as the due date approaches (OUT-3861).
export const REMINDER_ESCALATION_TAG: Record<TaskReminderType, string> = {
  [TaskReminderType.NO_DUE_DATE_3D]: '[Reminder]',
  [TaskReminderType.NO_DUE_DATE_7D]: '[Reminder]',
  [TaskReminderType.DUE_DATE_BEFORE_3D]: '[Due Soon]',
  [TaskReminderType.DUE_DATE_TODAY]: '[Due Soon]',
  [TaskReminderType.DUE_DATE_OVERDUE_3D]: '[Overdue]',
  [TaskReminderType.DUE_DATE_OVERDUE_7D]: '[Overdue]',
}

// Subjects intentionally omit any `<brandName> portal:` prefix — Copilot's email
// service prepends that itself, and adding it here results in a duplicated prefix.
export const getReminderEmailDetails = (
  workspace: WorkspaceResponse,
  task: Pick<Task, 'id' | 'title'>,
  isCompanyRecipient: boolean,
): Record<
  TaskReminderType,
  {
    title: string
    subject: string
    header: string
    body: string
    ctaParams: { taskId: string }
  }
> => {
  const labels = getWorkspaceLabels(workspace)
  const header = isCompanyRecipient ? `A task was assigned to your ${labels.groupTerm}` : 'A task was assigned to you'
  const ctaParams = { taskId: task.id }
  const title = 'View task'

  return {
    [TaskReminderType.NO_DUE_DATE_3D]: {
      subject: '[Reminder] You have a task to complete',
      header,
      title,
      body: `This is a friendly reminder that you have a task ‘${task.title}’ assigned to you that's still pending completion.\n\nIf you've already completed this task, please mark it as done in the portal.`,
      ctaParams,
    },
    [TaskReminderType.NO_DUE_DATE_7D]: {
      subject: '[Reminder] Task still pending',
      header,
      title,
      body: `This is a friendly reminder that you have a task ‘${task.title}’ that was assigned to you a week ago and is still pending.\n\nIf you've already completed this task, please mark it as done in the portal.`,
      ctaParams,
    },
    [TaskReminderType.DUE_DATE_BEFORE_3D]: {
      subject: '[Due Soon] Task due in 3 days',
      header,
      title,
      body: `This is a friendly reminder that you have a task ‘${task.title}’ due in 3 days.\n\nPlease make sure to complete this task by the due date.`,
      ctaParams,
    },
    [TaskReminderType.DUE_DATE_TODAY]: {
      subject: '[Due Soon] Task due today',
      header,
      title,
      body: `This is a friendly reminder that you have a task ‘${task.title}’ due today.\n\nPlease complete this task as soon as possible.`,
      ctaParams,
    },
    [TaskReminderType.DUE_DATE_OVERDUE_3D]: {
      subject: '[Overdue] Task was due 3 days ago',
      header,
      title,
      body: `This is a friendly reminder that the task ‘${task.title}’ is now overdue. It was due 3 days ago and is still pending completion.`,
      ctaParams,
    },
    [TaskReminderType.DUE_DATE_OVERDUE_7D]: {
      subject: '[Overdue] Task overdue by one week',
      header,
      title,
      body: `This is a friendly reminder that the task ‘${task.title}’ is now one week overdue.\n\nPlease complete this task as soon as possible.`,
      ctaParams,
    },
  }
}
