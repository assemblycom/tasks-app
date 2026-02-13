import { MAX_FETCH_ASSIGNEE_COUNT } from '@/constants/users'
import { deleteTaskNotifications, sendTaskCreateNotifications, sendTaskUpdateNotifications } from '@/jobs/notifications'
import { CreateTaskRequest, UpdateTaskRequest, Associations, AssociationsSchema } from '@/types/dto/tasks.dto'
import { DISPATCHABLE_EVENT } from '@/types/webhook'
import { UserIdsType } from '@/utils/assignee'
import { isPastDateString } from '@/utils/dateHelper'
import { PoliciesService } from '@api/core/services/policies.service'
import { Resource } from '@api/core/types/api'
import { UserAction } from '@api/core/types/user'
import {
  dispatchUpdatedWebhookEvent,
  getArchivedStatus,
  getTaskTimestamps,
  queueBodyUpdatedWebhook,
} from '@api/tasks/tasks.helpers'
import { TasksSharedService } from '@/app/api/tasks/tasksShared.service'
import { AssigneeType, Prisma, PrismaClient, Source, StateType, Task, TaskTemplate, WorkflowState } from '@prisma/client'
import httpStatus from 'http-status'
import z from 'zod'
import APIError from '@api/core/exceptions/api'
import { LabelMappingService } from '@api/label-mapping/label-mapping.service'
import { SubtaskService } from '@api/tasks/subtasks.service'
import { TasksActivityLogger } from '@api/tasks/tasks.logger'
import { TemplatesService } from '@api/tasks/templates/templates.service'
import { PublicTaskSerializer, TaskWithWorkflowStateAndAttachments } from '@api/tasks/public/public.serializer'
import { getBasicPaginationAttributes } from '@/utils/pagination'
import { AttachmentsService } from '@/app/api/attachments/attachments.service'

export class PublicTasksService extends TasksSharedService {
  async getAllTasks(queryFilters: {
    all?: boolean
    showIncompleteOnly?: boolean
    showArchived: boolean
    showUnarchived: boolean
    internalUserId?: string
    clientId?: string
    companyId?: string
    createdById?: string
    parentId?: string | null
    workflowState?: { type: StateType | { not: StateType } }
    limit?: number
    lastIdCursor?: string
  }): Promise<TaskWithWorkflowStateAndAttachments[]> {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Read, Resource.Tasks)

    const filters: Prisma.TaskWhereInput = this.buildTaskPermissions()

    let isArchived: boolean | undefined = false

    if (queryFilters.all) {
      isArchived = undefined
    } else {
      // Archived tasks are only accessible to IU
      // If both archived filters are explicitly 0 / falsey for IU, shortcircuit and return empty array
      if (!queryFilters.showArchived && !queryFilters.showUnarchived) {
        return []
      }
      isArchived = getArchivedStatus(queryFilters.showArchived, queryFilters.showUnarchived)
    }

    // If `parentId` is present, filter by parentId, ELSE return top-level parent comments
    filters.parentId = queryFilters.all
      ? undefined // if querying all accessible tasks, parentId filter doesn't make sense
      : await this.getParentIdFilter(queryFilters.parentId)

    const disjointTasksFilter: Prisma.TaskWhereInput =
      queryFilters.all || queryFilters.parentId
        ? {} // No need to support disjoint tasks when querying all tasks / subtasks
        : await this.getDisjointTasksFilter()

    const where: Prisma.TaskWhereInput = {
      ...filters,
      ...disjointTasksFilter,
      internalUserId: queryFilters.internalUserId,
      clientId: queryFilters.clientId,
      companyId: queryFilters.companyId,
      createdById: queryFilters.createdById,
      workflowState: queryFilters.workflowState || filters.workflowState,
      isArchived,
    }

    const orderBy: Prisma.TaskOrderByWithRelationInput[] = [{ createdAt: 'desc' }]
    const pagination = getBasicPaginationAttributes(queryFilters.limit, queryFilters.lastIdCursor)

    const tasks = await this.db.task.findMany({
      where,
      orderBy,
      ...pagination,
      relationLoadStrategy: 'join',
      include: {
        workflowState: true,
        attachments: true,
      },
    })

    return tasks
  }

  async getOneTask(id: string): Promise<TaskWithWorkflowStateAndAttachments> {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Read, Resource.Tasks)

    // Build query filters based on role of user. IU can access all tasks related to a workspace
    // while clients can only view the tasks assigned to them or their company
    const filters = this.buildTaskPermissions(id)
    const where = { ...filters, deletedAt: { not: undefined } }
    const task = await this.db.task.findFirst({
      where,
      relationLoadStrategy: 'join',
      include: {
        workflowState: true,
        attachments: true,
      },
    })

    if (!task) throw new APIError(httpStatus.NOT_FOUND, 'The requested task was not found')
    if (this.user.internalUserId) {
      await this.checkClientAccessForTask(task, this.user.internalUserId)
    }
    return task
  }

  async createTask(data: CreateTaskRequest, opts?: { disableSubtaskTemplates?: boolean; manualTimestamp?: Date }) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Create, Resource.Tasks)
    console.info('PublicTasksService#createTask | Creating task from public api with data:', data)

    const { internalUserId, clientId, companyId } = data

    const validatedIds = await this.validateUserIds(internalUserId, clientId, companyId)
    console.info('PublicTasksService#createTask | Validated user IDs:', validatedIds)

    const { assigneeId, assigneeType } = this.getAssigneeFromUserIds({
      internalUserId: validatedIds.internalUserId,
      clientId: validatedIds.clientId,
      companyId: validatedIds.companyId,
    })

    //generate the label
    const labelMappingService = new LabelMappingService(this.user)
    const label = z.string().parse(await labelMappingService.getLabel(validatedIds))
    console.info('PublicTasksService#createTask | Generated label for task:', label)
    if (data.parentId) {
      const canCreateSubTask = await this.canCreateSubTask(data.parentId)
      if (!canCreateSubTask) {
        throw new APIError(httpStatus.BAD_REQUEST, 'Reached the maximum subtask depth for this task')
      }
    }
    console.info('PublicTasksService#createTask | Subtask depth validated for parentId:', data.parentId)

    if (data.dueDate && isPastDateString(data.dueDate)) {
      throw new APIError(httpStatus.BAD_REQUEST, 'Due date cannot be in the past')
    }

    const { completedBy, completedByUserType, workflowStateStatus } = await this.getCompletionInfo(data?.workflowStateId)
    console.info('PublicTasksService#createTask | Completion info determined:', { completedBy, completedByUserType })

    // NOTE: This block strictly doesn't allow clients to create tasks
    let createdById = z.string().parse(this.user.internalUserId)

    if (data.createdById) {
      const internalUsers = await this.copilot.getInternalUsers({ limit: MAX_FETCH_ASSIGNEE_COUNT }) // there are 2 of these api running on this same serive. need to think about this later.
      const createdBy = internalUsers?.data?.find((iu) => iu.id === data.createdById)
      if (!createdBy) {
        throw new APIError(httpStatus.BAD_REQUEST, 'The requested user for createdBy was not found')
      }
      createdById = createdBy.id
      console.info('TasksService#createTask | createdById overridden for public API:', createdById)
    }

    let viewers: Associations = []
    if (data.associations?.length) {
      if (!validatedIds.internalUserId) {
        throw new APIError(httpStatus.BAD_REQUEST, `Task cannot be created with viewers if its not assigned to an IU.`)
      }
      viewers = await this.validateAssociations(data.associations)
      console.info('PublicTasksService#createTask | Associations validated for task:', viewers)
    }

    // Create a new task associated with current workspaceId. Also inject current request user as the creator.
    const newTask = await this.db.task.create({
      data: {
        ...data,
        workspaceId: this.user.workspaceId,
        createdById,
        label: label,
        completedBy,
        completedByUserType,
        source: Source.api,
        assigneeId,
        assigneeType,
        associations: viewers,
        ...validatedIds,
        ...(opts?.manualTimestamp && { createdAt: opts.manualTimestamp }),
        ...(await getTaskTimestamps('create', this.user, data, undefined, workflowStateStatus)),
      },
      include: {
        workflowState: true,
        attachments: true,
      },
    })
    console.info('PublicTasksService#createTask | Task created with ID:', newTask.id)

    if (newTask) {
      // Add activity logs
      const activityLogger = new TasksActivityLogger(this.user, newTask)
      await activityLogger.logNewTask({
        userId: createdById,
        role: AssigneeType.internalUser,
      }) //hardcoding internalUser as role since task can only be created by IUs.
      console.info('TasksService#createTask | Activity log created for new task ID:', newTask.id)

      try {
        if (newTask.body) {
          const newBody = await this.updateTaskIdOfAttachmentsAfterCreation(newTask.body, newTask.id)
          // Update task body with replaced attachment sources
          await this.db.task.update({
            where: { id: newTask.id },
            data: {
              body: newBody,
            },
          })
          console.info('TasksService#createTask | Task body attachments updated for task ID:', newTask.id)
        }

        // Add ltree path for task
        await this.addPathToTask(newTask)

        // Increment parent task's subtask count, if exists
        if (newTask.parentId) {
          const subtaskService = new SubtaskService(this.user)
          await Promise.all([
            subtaskService.addSubtaskCount(newTask.parentId),
            this.setNewLastSubtaskUpdated(newTask.parentId),
          ])
        }
        console.info('PublicTasksService#createTask | Post-processing completed for task ID:', newTask.id)
      } catch (e: unknown) {
        // Manually rollback task creation
        await this.db.$transaction([
          this.db.task.delete({ where: { id: newTask.id } }),
          this.db.activityLog.deleteMany({ where: { taskId: newTask.id } }),
        ])
        console.error('TasksService#createTask | Rolling back task creation', e)
        throw new APIError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to post-process task, new task was not created.')
      }
    }

    // Send task created notifications to users + dispatch webhook
    await Promise.all([
      sendTaskCreateNotifications.trigger({ user: this.user, task: newTask }),
      this.copilot.dispatchWebhook(DISPATCHABLE_EVENT.TaskCreated, {
        payload: await PublicTaskSerializer.serialize(newTask),
        workspaceId: this.user.workspaceId,
      }),
    ])

    if (data.templateId) {
      const templateService = new TemplatesService(this.user)
      const template = await templateService.getOneTemplate(data.templateId)

      if (!template) {
        throw new APIError(httpStatus.NOT_FOUND, 'The requested template was not found')
      }

      if (template.subTaskTemplates.length) {
        await Promise.all(
          template.subTaskTemplates.map(async (sub, index) => {
            const updatedSubTemplate = await templateService.getAppliedTemplateDescription(sub.id)
            const manualTimeStamp = new Date(template.createdAt.getTime() + (template.subTaskTemplates.length - index) * 10) //maintain the order of subtasks in tasks with respect to subtasks in templates
            await this.createSubtasksFromTemplate(updatedSubTemplate, newTask, manualTimeStamp)
          }),
        )
      }
    }

    return newTask
  }

  private async getValidatedAssociations({
    prevAssociations,
    associationsResetCondition,
  }: {
    prevAssociations: Prisma.JsonValue[]
    associationsResetCondition: boolean
  }) {
    let associations: Associations = AssociationsSchema.parse(prevAssociations)
    if (associations) {
      // only update of associations attribute is available. No associations in payload attribute means the data remains as it is in DB.
      if (associationsResetCondition || !associations?.length) {
        associations = [] // reset associations to [] if task is not reassigned to IU.
      } else if (associations?.length) {
        associations = await this.validateAssociations(associations)
      }
    }
    return associations
  }

  async updateTask(id: string, data: UpdateTaskRequest) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Update, Resource.Tasks)
    const filters = this.buildTaskPermissions(id)

    const prevTask = await this.db.task.findFirst({
      where: filters,
      relationLoadStrategy: 'join',
      include: { workflowState: true },
    })

    if (!prevTask) throw new APIError(httpStatus.NOT_FOUND, 'The requested task was not found')

    const { completedBy, completedByUserType } = await this.getCompletionInfo(data?.workflowStateId)

    const { internalUserId, clientId, companyId, ...dataWithoutUserIds } = data

    //todo : keep this in a separate shared util
    const shouldUpdateUserIds =
      (internalUserId !== undefined && internalUserId !== prevTask?.internalUserId) ||
      (clientId !== undefined && clientId !== prevTask?.clientId) ||
      (companyId !== undefined && companyId !== prevTask?.companyId)

    let validatedIds: UserIdsType | undefined

    if (shouldUpdateUserIds) {
      validatedIds = await this.validateUserIds(internalUserId, clientId, companyId)
    }

    const { assigneeId, assigneeType } = this.getAssigneeFromUserIds({
      internalUserId: validatedIds?.internalUserId ?? null,
      clientId: validatedIds?.clientId ?? null,
      companyId: validatedIds?.companyId ?? null,
    })

    const associations: Associations = await this.getValidatedAssociations({
      prevAssociations: prevTask.associations,
      associationsResetCondition: shouldUpdateUserIds ? !!clientId || !!companyId : !prevTask.internalUserId,
    })

    const userAssignmentFields = shouldUpdateUserIds
      ? {
          ...validatedIds,
          assigneeId,
          assigneeType,
        }
      : {}

    // Validate updated due date to not be in the past
    if (data.dueDate && isPastDateString(data.dueDate)) {
      throw new APIError(httpStatus.BAD_REQUEST, 'Due date cannot be in the past')
    }
    const subtaskService = new SubtaskService(this.user)

    let updatedTask = await this.db.$transaction(async (tx) => {
      //generate new label if prevTask has no assignee but now assigned to someone
      let label: string = prevTask.label
      if (!prevTask.assigneeId && assigneeId && assigneeType) {
        const labelMappingService = new LabelMappingService(this.user)
        labelMappingService.setTransaction(tx as PrismaClient)
        //delete the existing label
        await labelMappingService.deleteLabel(prevTask.label)
        if (validatedIds) {
          label = z.string().parse(await labelMappingService.getLabel(validatedIds))
        }
      }

      // Set / reset lastArchivedDate if isArchived has been triggered, else remove it from the update query
      let lastArchivedDate: Date | undefined | null = undefined
      let archivedBy: string | null | undefined = undefined
      if (data.isArchived !== undefined && prevTask.isArchived !== data.isArchived) {
        lastArchivedDate = data.isArchived === true ? new Date() : data.isArchived === false ? null : undefined
        archivedBy = data.isArchived === true ? this.user.internalUserId : data.isArchived === false ? null : undefined
      }

      // Get the updated task
      const updatedTask = await tx.task.update({
        where: { id },
        data: {
          ...dataWithoutUserIds,
          label,
          lastArchivedDate,
          archivedBy,
          completedBy,
          completedByUserType,
          associations,
          ...userAssignmentFields,
          ...(await getTaskTimestamps('update', this.user, data, prevTask)),
        },
        include: {
          workflowState: true,
          attachments: true,
        },
      })
      subtaskService.setTransaction(tx as PrismaClient)
      // Archive / unarchive all subtasks if parent task is archived / unarchived
      if (prevTask.isArchived !== data.isArchived && data.isArchived !== undefined) {
        await subtaskService.toggleArchiveForAllSubtasks(id, data.isArchived)
      }

      return updatedTask
    })

    if (updatedTask) {
      const activityLogger = new TasksActivityLogger(this.user, updatedTask)
      const isBodyChanged = prevTask.body !== updatedTask.body
      await Promise.all([
        activityLogger.logTaskUpdated(prevTask),
        this.setNewLastSubtaskUpdated(updatedTask.parentId),
        sendTaskUpdateNotifications.trigger({ prevTask, updatedTask, user: this.user }),
        dispatchUpdatedWebhookEvent(this.user, prevTask, updatedTask, true),
        isBodyChanged ? queueBodyUpdatedWebhook(this.user, updatedTask) : undefined,
      ])
    }

    return updatedTask
  }

  async deleteTask(id: string, recursive: boolean = true) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Delete, Resource.Tasks)
    const deletedBy = this.user.internalUserId

    // Try to delete existing client notification related to this task if exists
    const task = await this.db.task.findFirst({
      where: { id, workspaceId: this.user.workspaceId },
      relationLoadStrategy: 'join',
      include: { workflowState: true },
    })

    if (!task) throw new APIError(httpStatus.NOT_FOUND, 'The requested task to delete was not found')

    if (!recursive) {
      if (task.subtaskCount > 0) {
        throw new APIError(httpStatus.CONFLICT, 'Cannot delete task with subtasks. Use recursive delete instead.')
      }
    }

    //delete the associated label
    const labelMappingService = new LabelMappingService(this.user)

    // Note: this transaction is timing out in local machine
    const updatedTask = await this.db.$transaction(async (tx) => {
      labelMappingService.setTransaction(tx as PrismaClient)
      await labelMappingService.deleteLabel(task?.label)

      const deletedTask = await tx.task.update({
        where: { id, workspaceId: this.user.workspaceId },
        relationLoadStrategy: 'join',
        include: { workflowState: true },
        data: { deletedAt: new Date(), deletedBy: deletedBy },
      })
      await this.setNewLastSubtaskUpdated(task.parentId) //updates lastSubtaskUpdated timestamp of parent task if there is task.parentId
      const subtaskService = new SubtaskService(this.user)
      subtaskService.setTransaction(tx as PrismaClient)
      if (task.parentId) {
        await subtaskService.decreaseSubtaskCount(task.parentId)
      }
      await subtaskService.softDeleteAllSubtasks(task.id)
      return { ...deletedTask, attachments: [] } // empty attachments array for deleted tasks
    })

    await Promise.all([
      new AttachmentsService(this.user).deleteAttachmentsOfTask([task.id]), // delete attachments of the task and its subtasks
      deleteTaskNotifications.trigger({ user: this.user, task }),
      this.copilot.dispatchWebhook(DISPATCHABLE_EVENT.TaskDeleted, {
        payload: await PublicTaskSerializer.serialize(updatedTask),
        workspaceId: this.user.workspaceId,
      }),
    ])

    return updatedTask

    // Logic to remove internal user notifications when a task is deleted / assignee is deleted
    // ...In case requirements change later again
    // const notificationService = new NotificationService(this.user)
    // await notificationService.deleteInternalUserNotificationForTask(id)
  }

  async hasMoreTasksAfterCursor(
    id: string,
    publicFilters: Partial<Parameters<PublicTasksService['getAllTasks']>[0]>,
  ): Promise<boolean> {
    const nextTask = await this.db.task.findFirst({
      where: { ...publicFilters, workspaceId: this.user.workspaceId },
      cursor: { id },
      skip: 1,
      orderBy: { createdAt: 'desc' },
    })
    return !!nextTask
  }
}
