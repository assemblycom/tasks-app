import { maxSubTaskDepth } from '@/constants/tasks'
import { MAX_FETCH_ASSIGNEE_COUNT } from '@/constants/users'
import { InternalUsers, TempClientFilter, Uuid } from '@/types/common'
import { CreateAttachmentRequestSchema } from '@/types/dto/attachments.dto'
import { CreateTaskRequest, CreateTaskRequestSchema, Associations, UpdateTaskRequest } from '@/types/dto/tasks.dto'
import { getFileNameFromPath } from '@/utils/attachmentUtils'
import { buildLtree, buildLtreeNodeString } from '@/utils/ltree'
import { getFilePathFromUrl } from '@/utils/signedUrlReplacer'
import { getSignedUrl } from '@/utils/signUrl'
import { SupabaseActions } from '@/utils/SupabaseActions'
import APIError from '@api/core/exceptions/api'
import { BaseService } from '@api/core/services/base.service'
import { UserRole } from '@api/core/types/user'
import { AssigneeType, Prisma, PrismaClient, StateType, Task, TaskTemplate } from '@prisma/client'
import httpStatus from 'http-status'
import z from 'zod'
import { AttachmentsService } from '@api/attachments/attachments.service'

//Base class with shared permission logic and methods that both tasks.service.ts and public.service.ts could use
export abstract class TasksSharedService extends BaseService {
  protected abstract createTask(
    data: CreateTaskRequest,
    opts?: { disableSubtaskTemplates?: boolean; manualTimestamp?: Date },
  ): Promise<unknown>

  /**
   * Builds filter for "get" service methods.
   * If user is an IU, return filter for all tasks associated with this workspace
   * If user is a client, return filter for just the tasks assigned to this clientId.
   * If user is a client and has a companyId, return filter for just the tasks assigned to this clientId `OR` to this companyId
   */
  protected buildTaskPermissions(id?: string, includeAssociatedTask: boolean = true) {
    const user = this.user

    // Default filters
    let filters: Prisma.TaskWhereInput = {
      id,
      workspaceId: user.workspaceId,
    }

    if (user.clientId || user.companyId) {
      filters = { ...filters, ...this.getClientOrCompanyAssigneeFilter(includeAssociatedTask) }
    }

    return filters
  }

  protected getClientOrCompanyAssigneeFilter(includeAssociatedTask: boolean = true): Prisma.TaskWhereInput {
    const clientId = z.string().uuid().safeParse(this.user.clientId).data
    const companyId = z.string().uuid().parse(this.user.companyId)
    const isCuPortal = !this.user.internalUserId && (clientId || companyId)

    const filters = []

    if (clientId && companyId) {
      filters.push(
        // Get client tasks for the particular companyId
        { clientId, companyId },
        // Get company tasks for the client's companyId
        { companyId, clientId: null },
      )

      // Get tasks that includes the client as a association
      if (includeAssociatedTask) {
        const tempClientFilter: TempClientFilter = {
          associations: {
            hasSome: [{ clientId, companyId }, { companyId }],
          },
        }
        if (isCuPortal) tempClientFilter.isShared = true
        filters.push(tempClientFilter)
      }
    } else if (companyId) {
      filters.push(
        // Get only company tasks for the client's companyId
        { clientId: null, companyId },
      )
      if (includeAssociatedTask) {
        const tempCompanyFilter: TempClientFilter = {
          associations: {
            hasSome: [{ companyId }],
          },
        }
        if (isCuPortal) tempCompanyFilter.isShared = true
        // Get tasks that includes the company as a viewer
        filters.push(tempCompanyFilter)
      }
    }
    return filters.length > 0 ? { OR: filters } : {}
  }

  protected async getParentIdFilter(parentId?: string | null) {
    // If `parentId` is present, filter by parentId
    if (parentId) {
      return z.string().uuid().parse(parentId)
    }
    if (this.user.companyId) {
      // If user is client, flatten subtasks by not filtering by parentId right now
      return undefined
    }
    // If user is IU, no need to flatten subtasks
    if (this.user.role === UserRole.IU && !this.user.clientId) {
      if (this.user.internalUserId) {
        const currentInternalUser = await this.copilot.getInternalUser(this.user.internalUserId)
        if (currentInternalUser.isClientAccessLimited) {
          return undefined
        }
      }
      return null
    }
    return undefined
  }

  protected getDisjointTasksFilter = () => {
    // For disjoint tasks, show this subtask as a root-level task
    // This n-node matcher matches any task tree chain where previous task's assigneeId is not self's
    // E.g. A -> B -> C, where A is assigned to user 1, B is assigned to user 2, C is assigned to user 2
    // For user 2, task B should show up as a parent task in the main task board
    const disjointTasksFilter: Promise<Prisma.TaskWhereInput> = (async () => {
      if (this.user.role === UserRole.IU && !this.user.clientId && !this.user.companyId) {
        const currentInternalUser = await this.copilot.getInternalUser(z.string().parse(this.user.internalUserId))
        if (!currentInternalUser.isClientAccessLimited) return {}

        const accesibleCompanyIds = currentInternalUser.companyAccessList || []
        return {
          OR: [
            {
              parent: { companyId: { notIn: accesibleCompanyIds } },
            },
            {
              parentId: null,
            },
          ],
        }
      }

      return {
        OR: [
          // Parent is not assigned to client
          {
            ...this.getClientOrCompanyAssigneeFilter(), // Prevent overwriting of OR statement
            parent: {
              AND: [
                {
                  OR: [
                    // Disjoint task if parent has no assignee
                    { clientId: null, companyId: null },
                    {
                      NOT: {
                        // Do not disjoint task if parent task belongs to the same client / company
                        OR: [
                          // Disjoint task if parent is a client task for a different client under the same company
                          { clientId: this.user.clientId, companyId: this.user.companyId },
                          // Disjoint task if parent is not a company task for the same company that client belongs to
                          { clientId: null, companyId: this.user.companyId },
                        ],
                      },
                    },
                  ],
                },
                {
                  NOT: {
                    associations: {
                      hasSome: [
                        { clientId: this.user.clientId, companyId: this.user.companyId },
                        { companyId: this.user.companyId },
                      ],
                    },
                  }, //AND do not disjoint if parent is accesible to the client through client visibility.
                },
              ],
            },
          },
          // Task is a parent / standalone task
          {
            ...this.getClientOrCompanyAssigneeFilter(),
            parentId: null,
          },
        ],
      }
    })()

    return disjointTasksFilter
  }

  protected async checkClientAccessForTask(task: Task, internalUserId: string) {
    const currentInternalUser = await this.copilot.getInternalUser(internalUserId)
    if (!currentInternalUser.isClientAccessLimited) return

    const isLimitedTask = !(await this.filterTasksByClientAccess([task], currentInternalUser)).length
    if (isLimitedTask) {
      throw new APIError(
        httpStatus.UNAUTHORIZED,
        "This task's assignee is not included in your list of accessible clients / companies",
      )
    }
  }

  protected async filterTasksByClientAccess<T extends Task>(tasks: T[], currentInternalUser: InternalUsers): Promise<T[]> {
    const hasClientOrCompanyTasks = tasks.some((task) => task.companyId)
    if (!hasClientOrCompanyTasks) {
      return tasks
    }

    return tasks.filter((task) => {
      // Pass all tasks that are unassigned or are assigned to IU
      if ((!task.internalUserId && !task.clientId && !task.companyId) || task.internalUserId) return true
      // For remaining client or company tasks, check if companyAccessList includes this companyId
      return currentInternalUser.companyAccessList?.includes(task.companyId || '')
    })
  }

  protected async validateUserIds(
    internalUserId?: string | null,
    clientId?: string | null,
    companyId?: string | null,
  ): Promise<{
    internalUserId: string | null
    clientId: string | null
    companyId: string | null
  }> {
    if (internalUserId) {
      const internalUsers = (await this.copilot.getInternalUsers({ limit: MAX_FETCH_ASSIGNEE_COUNT })).data
      const isValid = internalUsers?.some((user) => user.id === internalUserId)

      if (!isValid) {
        throw new APIError(httpStatus.BAD_REQUEST, `Invalid internalUserId`)
      }

      return {
        internalUserId,
        clientId: null,
        companyId: null,
      }
    }

    if (clientId) {
      const client = await this.copilot.getClient(clientId)

      const isValidCompany = companyId ? client?.companyIds?.includes(companyId) : false

      if (!client) {
        throw new APIError(httpStatus.BAD_REQUEST, `Invalid clientId`)
      }

      if (!companyId || !isValidCompany) {
        throw new APIError(httpStatus.BAD_REQUEST, `Invalid company for the provided clientId`)
      }

      return {
        internalUserId: null,
        clientId,
        companyId,
      }
    }

    if (companyId) {
      const companies = (await this.copilot.getCompanies({ limit: MAX_FETCH_ASSIGNEE_COUNT })).data
      const isValid = companies?.some((company) => company.id === companyId)

      if (!isValid) {
        throw new APIError(httpStatus.BAD_REQUEST, `Invalid companyId`)
      }

      return {
        internalUserId: null,
        clientId: null,
        companyId,
      }
    }

    return {
      internalUserId: null,
      clientId: null,
      companyId: null,
    }
  }

  protected getAssigneeFromUserIds(userIds: {
    internalUserId: string | null
    clientId: string | null
    companyId: string | null
  }): { assigneeId: string | null; assigneeType: AssigneeType | null } {
    const { internalUserId, clientId, companyId } = userIds

    if (internalUserId) {
      return {
        assigneeId: internalUserId,
        assigneeType: AssigneeType.internalUser,
      }
    }

    if (clientId) {
      return {
        assigneeId: clientId,
        assigneeType: AssigneeType.client,
      }
    }

    if (companyId) {
      return {
        assigneeId: companyId,
        assigneeType: AssigneeType.company,
      }
    }
    return {
      assigneeId: null,
      assigneeType: null,
    }
  }

  protected async canCreateSubTask(taskId: string): Promise<boolean> {
    const parentPath = await this.getPathOfTask(taskId)
    if (!parentPath) {
      throw new APIError(httpStatus.NOT_FOUND, 'The requested parent task was not found')
    }
    const uuidLength = parentPath.split('.').length
    if (!uuidLength) return true
    return uuidLength <= maxSubTaskDepth
  }

  private async getPathOfTask(id: string) {
    return (
      await this.db.$queryRaw<{ path: string }[] | null>`
          SELECT "path"
          FROM "Tasks"
          WHERE id::text = ${id}
            AND "workspaceId" = ${this.user.workspaceId}
        `
    )?.[0]?.path
  }

  protected async getCompletionInfo(targetWorkflowStateId?: string | null): Promise<{
    completedBy: string | null
    completedByUserType: AssigneeType | null
    workflowStateStatus: StateType
  }> {
    if (!targetWorkflowStateId) {
      return { completedBy: null, completedByUserType: null, workflowStateStatus: StateType.unstarted }
    }

    const role = this.user.role

    const workflowState = await this.db.workflowState.findFirst({
      where: { id: targetWorkflowStateId, workspaceId: this.user.workspaceId },
      select: { type: true },
    })

    if (!workflowState) {
      throw new APIError(httpStatus.NOT_FOUND, 'The requested workflow state was not found')
    }

    if (workflowState.type === StateType.completed) {
      return {
        completedBy: z.string().parse(role === AssigneeType.internalUser ? this.user.internalUserId : this.user.clientId),
        completedByUserType: role,
        workflowStateStatus: workflowState.type,
      }
    }

    return { completedBy: null, completedByUserType: null, workflowStateStatus: workflowState.type }
  }

  protected async validateAssociations(associations: Associations) {
    if (!associations?.length) return []
    const association = associations[0]
    try {
      if (association.clientId) {
        const client = await this.copilot.getClient(association.clientId) //support looping associations and filtering from getClients instead of doing getClient if we do support many associations in the future.
        if (!client.companyIds?.includes(associations[0].companyId)) {
          throw new APIError(httpStatus.BAD_REQUEST, 'Invalid companyId for the provided association.')
        }
      } else {
        await this.copilot.getCompany(association.companyId)
      }
    } catch (err) {
      if (err instanceof APIError) {
        throw err
      }
      throw new APIError(httpStatus.BAD_REQUEST, `Association should be a CU.`)
    }

    return associations
  }

  protected async updateTaskIdOfAttachmentsAfterCreation(htmlString: string, task_id: string) {
    const imgTagRegex = /<img\s+[^>]*src="([^"]+)"[^>]*>/g //expression used to match all img srcs in provided HTML string.
    const attachmentTagRegex = /<\s*[a-zA-Z]+\s+[^>]*data-type="attachment"[^>]*src="([^"]+)"[^>]*>/g //expression used to match all attachment srcs in provided HTML string.
    let match
    const replacements: { originalSrc: string; newUrl: string }[] = []

    const newFilePaths: { originalSrc: string; newFilePath: string }[] = []
    const copyAttachmentPromises: Promise<void>[] = []
    const createAttachmentPayloads = []
    const matches: { originalSrc: string; filePath: string; fileName: string }[] = []

    while ((match = imgTagRegex.exec(htmlString)) !== null) {
      const originalSrc = match[1]
      const filePath = getFilePathFromUrl(originalSrc)
      const fileName = filePath?.split('/').pop()
      if (filePath && fileName) {
        matches.push({ originalSrc, filePath, fileName })
      }
    }

    while ((match = attachmentTagRegex.exec(htmlString)) !== null) {
      const originalSrc = match[1]
      const filePath = getFilePathFromUrl(originalSrc)
      const fileName = filePath?.split('/').pop()
      if (filePath && fileName) {
        matches.push({ originalSrc, filePath, fileName })
      }
    }

    for (const { originalSrc, filePath, fileName } of matches) {
      const newFilePath = `${this.user.workspaceId}/${task_id}/${fileName}`
      const supabaseActions = new SupabaseActions()

      const fileMetaData = await supabaseActions.getMetaData(filePath)
      createAttachmentPayloads.push(
        CreateAttachmentRequestSchema.parse({
          taskId: task_id,
          filePath: newFilePath,
          fileSize: fileMetaData?.size,
          fileType: fileMetaData?.contentType,
          fileName: fileMetaData?.metadata?.originalFileName || getFileNameFromPath(newFilePath),
        }),
      )
      copyAttachmentPromises.push(supabaseActions.moveAttachment(filePath, newFilePath))
      newFilePaths.push({ originalSrc, newFilePath })
    }

    await Promise.all(copyAttachmentPromises)
    if (createAttachmentPayloads.length) {
      const attachmentService = new AttachmentsService(this.user)
      await attachmentService.createMultipleAttachments(createAttachmentPayloads)
    }

    const signedUrlPromises = newFilePaths.map(async ({ originalSrc, newFilePath }) => {
      const newUrl = await getSignedUrl(newFilePath)
      if (newUrl) {
        replacements.push({ originalSrc, newUrl })
      }
    })

    await Promise.all(signedUrlPromises)

    for (const { originalSrc, newUrl } of replacements) {
      htmlString = htmlString.replace(originalSrc, newUrl)
    }
    const filePaths = newFilePaths.map(({ newFilePath }) => newFilePath)
    await this.db.scrapMedia.updateMany({
      where: {
        filePath: {
          in: filePaths,
        },
      },
      data: {
        taskId: task_id,
      },
    })
    return htmlString
  }

  protected async addPathToTask(task: Task) {
    let path: string = buildLtreeNodeString(task.id)
    if (task.parentId) {
      const parentPath = await this.getPathOfTask(task.parentId)
      if (!parentPath) {
        throw new APIError(httpStatus.NOT_FOUND, 'The requested parent task was not found')
      }
      path = buildLtree(parentPath, task.id)
    }

    await this.db.$executeRaw`
      UPDATE "Tasks"
      SET path = ${buildLtreeNodeString(path)}::ltree
      WHERE id::text = ${task.id}
        AND "workspaceId" = ${this.user.workspaceId}
    `
  }

  protected async setNewLastSubtaskUpdated(parentId?: z.infer<typeof Uuid> | null) {
    if (!parentId) {
      return
    }
    try {
      await this.db.task.update({
        where: { id: parentId, workspaceId: this.user.workspaceId },
        data: {
          lastSubtaskUpdated: new Date(),
        },
      })
    } catch (e) {
      console.error('TaskService#setNewLastSubtaskUpdated::', e)
    }
  }

  protected async createSubtasksFromTemplate(data: TaskTemplate, parentTask: Task, manualTimestamp: Date) {
    const { workspaceId, title, body, workflowStateId } = data
    const previewMode = Boolean(this.user.clientId || this.user.companyId)
    const { id: parentId, internalUserId, clientId, companyId, associations } = parentTask

    try {
      const createTaskPayload = CreateTaskRequestSchema.parse({
        title,
        body,
        workspaceId,
        workflowStateId,
        parentId,
        templateId: undefined, //just to be safe from circular recursion
        ...(previewMode && {
          internalUserId,
          clientId,
          companyId,
          associations,
        }), //On CRM view, we set assignee and viewers for subtasks same as the parent task.
      })

      await this.createTask(createTaskPayload, { disableSubtaskTemplates: true, manualTimestamp: manualTimestamp })
    } catch (e) {
      const deleteTask = this.db.task.delete({ where: { id: parentId } })
      const deleteActivityLogs = this.db.activityLog.deleteMany({ where: { taskId: parentId } })

      await this.db.$transaction(async (tx) => {
        this.setTransaction(tx as PrismaClient)
        await deleteTask
        await deleteActivityLogs
        this.unsetTransaction()
      })

      console.error('TasksService#createTask | Rolling back task creation', e)
      throw new APIError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to create subtask from template, new task was not created.',
      )
    }
  }

  protected validateTaskShare(prevTask: Task, data: UpdateTaskRequest): boolean | undefined {
    const finalIsShared = data.isShared !== undefined ? data.isShared : prevTask.isShared

    const finalInternalUser = data.internalUserId !== undefined ? data.internalUserId : prevTask.internalUserId

    const finalAssociations = data.associations !== undefined ? data.associations : prevTask.associations

    if (!finalIsShared) return false

    const hasInternalUser = !!finalInternalUser
    const hasAssociations = !!finalAssociations?.length

    if (!hasInternalUser || !hasAssociations) {
      throw new APIError(
        httpStatus.BAD_REQUEST,
        'Cannot share task. A task must have an internal user and at least one association to be shared.',
      )
    }

    return true
  }
}
