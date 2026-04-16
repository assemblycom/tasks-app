import { TasksService } from '@/app/api/tasks/tasks.service'
import { TaskWithWorkflowState } from '@/types/db'
import { ArchivedStateUpdatedSchema } from '@api/activity-logs/schemas/ArchiveStateUpdatedSchema'
import { DueDateChangedSchema } from '@api/activity-logs/schemas/DueDateChangedSchema'
import { TaskAssignedSchema, TaskUnassignedSchema } from '@api/activity-logs/schemas/TaskAssignedSchema'
import { TaskCreatedSchema } from '@api/activity-logs/schemas/TaskCreatedSchema'
import { TitleUpdatedSchema } from '@api/activity-logs/schemas/TitleUpdatedSchema'
import { WorkflowStateUpdatedSchema } from '@api/activity-logs/schemas/WorkflowStateUpdatedSchema'
import { ActivityLogger } from '@api/activity-logs/services/activity-logger.service'
import User from '@api/core/models/User.model'
import { BaseService } from '@api/core/services/base.service'
import { ActivityType, AssigneeType, Task, WorkflowState } from '@prisma/client'
import { ViewerAddedSchema, ViewerRemovedSchema } from '@api/activity-logs/schemas/ViewerSchema'
import { AssociationsSchema } from '@/types/dto/tasks.dto'

/**
 * Wrapper over ActivityLogger to implement a clean abstraction for task creation / update events
 * @param user - Current session user
 * @param task - Current task for creation, or current task after updating for update events
 * @param customCopilotApiKey - Custom API Key for `copilotApi` (optional)
 */
export class TasksActivityLogger extends BaseService {
  private activityLogger: ActivityLogger

  constructor(
    user: User,
    private task: Task & { workflowState: WorkflowState },
    customCopilotApiKey?: string,
  ) {
    super(user, customCopilotApiKey)
    this.activityLogger = new ActivityLogger({ taskId: this.task.id, user })
  }

  async logNewTask(createdBy?: {
    userId: string
    // We don't need to pass userCompanyId here because Clients currently cannot create tasks
    // Remove this commented code if this feature is implemented in the future
    // userCompanyId?: string
    role: AssigneeType
  }) {
    await this.logTaskCreated(createdBy)
  }

  async logTaskUpdated(prevTask: Task & { workflowState: WorkflowState }) {
    const tasksService = new TasksService(this.user)
    let shouldUpdateLastActivityLog = false
    const setUpdate = () => (shouldUpdateLastActivityLog = true)
    if (this.task.assigneeId !== prevTask.assigneeId) {
      if (this.task.assigneeId) {
        await this.logTaskAssigneeUpdated(prevTask)
        setUpdate()
      } else {
        await this.logTaskAssigneeUnassigned(prevTask)
        setUpdate()
      }
    }

    if (Array.isArray(this.task.associations) && Array.isArray(prevTask.associations)) {
      const currentAssociations = AssociationsSchema.parse(this.task.associations) || []
      const prevAssociations = AssociationsSchema.parse(prevTask.associations) || []
      const currentShared = this.task.isShared
      const prevShared = prevTask.isShared

      // handles the case to show activity log when a task is shared with association
      if (
        (!!currentAssociations.length || !!prevAssociations.length) &&
        (currentAssociations[0]?.clientId !== prevAssociations[0]?.clientId ||
          currentAssociations[0]?.companyId !== prevAssociations[0]?.companyId ||
          currentShared !== prevShared) &&
        (currentShared || prevShared)
      ) {
        const currentAssociationId = currentAssociations[0]?.clientId || currentAssociations[0]?.companyId || null
        const prevAssociationId = prevAssociations[0]?.clientId || prevAssociations[0]?.companyId || null

        if (currentAssociationId) {
          if (prevAssociationId && currentAssociationId !== prevAssociationId && prevShared)
            await this.logTaskViewerRemoved(prevAssociationId) // if previous viewer exists, log removed event
          if (currentShared) {
            await this.logTaskViewerUpdated(prevAssociationId, currentAssociationId)
          } else {
            await this.logTaskViewerRemoved(currentAssociationId)
          }
          setUpdate()
        } else if (prevAssociationId && prevShared) {
          await this.logTaskViewerRemoved(prevAssociationId)
          setUpdate()
        }
      }
    }

    if (this.task.workflowStateId !== prevTask?.workflowStateId) {
      await this.logWorkflowStateUpdated(prevTask)
      setUpdate()
    }
    if (this.task.isArchived !== prevTask.isArchived) {
      await this.logArchiveStateUpdated(prevTask)
      setUpdate()
    }
    if (this.task.dueDate !== prevTask.dueDate) {
      await this.logDueDateChanged(prevTask)
      setUpdate()
    }
    if (this.task.title.trim() !== prevTask.title.trim()) {
      await this.logTitleUpdated(prevTask)
      setUpdate()
    }

    if (shouldUpdateLastActivityLog) {
      await tasksService.setNewLastActivityLogUpdated(this.task.id)
    }
  }

  private async logWorkflowStateUpdated(prevTask: Task & { workflowState: WorkflowState }) {
    await this.activityLogger.log(
      ActivityType.WORKFLOW_STATE_UPDATED,
      WorkflowStateUpdatedSchema.parse({
        oldValue: prevTask.workflowState.id,
        newValue: this.task.workflowState.id,
      }),
    )
  }

  private async logArchiveStateUpdated(prevTask: Task) {
    await this.activityLogger.log(
      ActivityType.ARCHIVE_STATE_UPDATED,
      ArchivedStateUpdatedSchema.parse({
        oldValue: prevTask.isArchived,
        newValue: this.task.isArchived,
      }),
    )
  }

  private async logDueDateChanged(prevTask: Task) {
    await this.activityLogger.log(
      ActivityType.DUE_DATE_CHANGED,
      DueDateChangedSchema.parse({
        oldValue: prevTask.dueDate,
        newValue: this.task.dueDate,
      }),
    )
  }

  private async logTitleUpdated(prevTask: Task) {
    await this.activityLogger.log(
      ActivityType.TITLE_UPDATED,
      TitleUpdatedSchema.parse({
        oldValue: prevTask.title,
        newValue: this.task.title,
      }),
    )
  }

  private async logTaskAssigneeUpdated(prevTask?: Task & { workflowState: WorkflowState }) {
    await this.activityLogger.log(
      ActivityType.TASK_ASSIGNED,
      TaskAssignedSchema.parse({
        oldValue: prevTask?.assigneeId ?? null,
        newValue: this.task.assigneeId,
      }),
    )
  }

  private async logTaskAssigneeUnassigned(prevTask?: TaskWithWorkflowState) {
    await this.activityLogger.log(
      ActivityType.TASK_UNASSIGNED,
      TaskUnassignedSchema.parse({
        oldValue: prevTask?.assigneeId!,
        newValue: null,
      }),
    )
  }

  private async logTaskCreated(createdBy?: { userId: string; role: AssigneeType }) {
    await this.activityLogger.log(
      ActivityType.TASK_CREATED,
      TaskCreatedSchema.parse({
        taskId: this.task.id,
      }),
      createdBy,
    )
  }

  private async logTaskViewerUpdated(previousViewerId: string | null, currentViewerId: string | null) {
    await this.activityLogger.log(
      ActivityType.VIEWER_ADDED,
      ViewerAddedSchema.parse({
        oldValue: previousViewerId,
        newValue: currentViewerId,
      }),
    )
  }

  private async logTaskViewerRemoved(previousViewerId: string | null) {
    await this.activityLogger.log(
      ActivityType.VIEWER_REMOVED,
      ViewerRemovedSchema.parse({
        oldValue: previousViewerId,
      }),
    )
  }
}
