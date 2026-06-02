import { maxSubTaskDepth } from '@/constants/tasks'
import { MAX_FETCH_ASSIGNEE_COUNT } from '@/constants/users'
import { InternalUsers, Uuid } from '@/types/common'
import { CreateAttachmentRequestSchema } from '@/types/dto/attachments.dto'
import {
  CreateTaskRequest,
  CreateTaskRequestSchema,
  Associations,
  UpdateTaskRequest,
  AssociationsSchema,
} from '@/types/dto/tasks.dto'
import { getFileNameFromPath } from '@/utils/attachmentUtils'
import { resolveDynamicFields, resolveAutofillTags } from '@/utils/dynamicFields'
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
  protected async buildTaskPermissions(id?: string, includeAssociatedTask: boolean = true) {
    const user = this.user

    // Default filters
    let filters: Prisma.TaskWhereInput = {
      id,
      workspaceId: user.workspaceId,
    }

    if (user.clientId || user.companyId) {
      filters = { ...filters, ...(await this.getClientOrCompanyAssigneeFilter(includeAssociatedTask)) }
    }

    return filters
  }

  /**
   * Prisma where fragment that limits a task query to rows the current user is allowed to read/update.
   * Returns `{}` for full-access internal users (no extra constraint).
   * Spread into an existing where: `{ parentId, workspaceId, deletedAt, ...accessWhere }`.
   * Mirrors the access semantics of `filterTasksByClientAccess` so it can replace per-row in-memory filtering with a SQL filter.
   */
  protected async getAccessFilterForTasks(): Promise<Prisma.TaskWhereInput> {
    if (this.user.clientId || this.user.companyId) {
      return await this.getClientOrCompanyAssigneeFilter()
    }

    if (this.user.role === UserRole.IU && this.user.internalUserId) {
      const currentInternalUser = await this.copilot.getInternalUser(this.user.internalUserId)
      if (currentInternalUser.isClientAccessLimited) {
        const companyAccessList = currentInternalUser.companyAccessList || []
        return {
          AND: [
            {
              OR: [
                { internalUserId: { not: null } },
                { internalUserId: null, clientId: null, companyId: null },
                { companyId: { in: companyAccessList } },
              ],
            },
            this.getAccessibleAssociationsFilter(companyAccessList),
          ],
        }
      }
    }

    return {}
  }

  /**
   * Prisma where fragment matching tasks whose `associations` is empty OR whose single association
   * references a company within the access list. Uses `array_contains` (Postgres `@>`) so the
   * `{companyId}` filter matches both stored `{companyId}` and `{clientId, companyId}` shapes.
   * Relies on `AssociationsSchema.max(1)` — with a single element, "contains companyId" ≡ "all in scope".
   */
  private getAccessibleAssociationsFilter(companyAccessList: string[]): Prisma.TaskWhereInput {
    return {
      OR: [
        { associations: { equals: [] } },
        ...companyAccessList.map((companyId) => ({
          associations: { array_contains: [{ companyId }] } as Prisma.JsonFilter,
        })),
      ],
    }
  }

  protected async getClientOrCompanyAssigneeFilter(includeAssociatedTask: boolean = true): Promise<Prisma.TaskWhereInput> {
    const clientId = z.string().uuid().safeParse(this.user.clientId).data
    const companyId = z.string().uuid().safeParse(this.user.companyId).data
    const isCuPortal = !this.user.internalUserId && (clientId || companyId)
    const isIuCompanyPreview = !!this.user.internalUserId && !clientId && !!companyId

    const filters: Prisma.TaskWhereInput[] = []

    if (clientId && companyId) {
      filters.push(
        // Get client tasks for the particular companyId
        { clientId, companyId },
        // Get company tasks for the client's companyId
        { companyId, clientId: null },
      )

      // Get tasks that include the client as an association
      if (includeAssociatedTask) {
        // Match tasks associated with this specific client+company OR with the company at large.
        // `equals` preserves the prior exact-match semantics: tasks associated with a DIFFERENT
        // client at the same company do not match.
        const associationVariants: Prisma.TaskWhereInput[] = [
          { associations: { equals: [{ clientId, companyId }] } },
          { associations: { equals: [{ companyId }] } },
        ]
        if (isCuPortal) {
          filters.push({ OR: associationVariants, isShared: true })
        } else {
          filters.push(...associationVariants)
        }
      }
    } else if (companyId) {
      filters.push(
        // Get only company tasks for the client's companyId
        { clientId: null, companyId },
      )
      if (includeAssociatedTask) {
        const companyAssociationFilter: Prisma.TaskWhereInput = {
          associations: { equals: [{ companyId }] },
        }
        if (isCuPortal) {
          filters.push({ ...companyAssociationFilter, isShared: true })
        } else {
          filters.push(companyAssociationFilter)
        }
      }

      // OUT-2898: When an IU is previewing a company in the CRM, also include
      // tasks belonging to clients of this company (TEAM TASKS) and IU tasks
      // shared with those clients (SHARED WITH TEAM).
      if (isIuCompanyPreview) {
        const companyClientIds = (await this.copilot.getCompanyClients(companyId)).map((c) => c.id)
        if (companyClientIds.length > 0) {
          filters.push({ clientId: { in: companyClientIds }, companyId })
          if (includeAssociatedTask) {
            // Match tasks whose single association is `{clientId, companyId}` for any client of this company.
            // `equals` preserves the prior `hasSome` exact-match semantics.
            filters.push(
              ...companyClientIds.map((cId) => ({
                associations: { equals: [{ clientId: cId, companyId }] } as Prisma.JsonFilter,
              })),
            )
          }
        }
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
        // Use a single `parent: {}` relation filter — splitting into two separate `parent: {}`
        // references at this OR level causes Prisma to emit multiple parent joins and the
        // matching subtask row gets returned twice.
        return {
          OR: [
            {
              parent: {
                OR: [
                  { companyId: { notIn: accesibleCompanyIds } },
                  // Parent inaccessible because its association is outside the access list
                  { NOT: this.getAccessibleAssociationsFilter(accesibleCompanyIds) },
                ],
              },
            },
            { parentId: null },
          ],
        }
      }

      const accessFilter = await this.getClientOrCompanyAssigneeFilter()
      return {
        OR: [
          // Parent is not assigned to client
          {
            ...accessFilter, // Prevent overwriting of OR statement
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
                  // AND do not disjoint if parent is accessible to the client through association.
                  // Uses `equals` (full-array exact match) to preserve the prior `hasSome` semantics
                  // — tasks associated with a different client at the same company do not match.
                  NOT: {
                    OR: [
                      {
                        associations: {
                          equals: [{ clientId: this.user.clientId, companyId: this.user.companyId }],
                        },
                      },
                      { associations: { equals: [{ companyId: this.user.companyId }] } },
                    ],
                  },
                },
              ],
            },
          },
          // Task is a parent / standalone task
          {
            ...accessFilter,
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
        "This task's assignee or association is not included in your list of accessible clients / companies",
      )
    }
  }

  protected async filterTasksByClientAccess<T extends Task>(tasks: T[], currentInternalUser: InternalUsers): Promise<T[]> {
    const hasClientOrCompanyTasks = tasks.some(
      (task) => task.companyId || (Array.isArray(task.associations) && task.associations.length > 0),
    )
    if (!hasClientOrCompanyTasks) {
      return tasks
    }

    const companyAccessList = currentInternalUser.companyAccessList || []

    return tasks.filter((task) => {
      // If task is assigned to a client/company, the assignee company must be in access list
      if (task.companyId && !companyAccessList.includes(task.companyId)) {
        return false
      }
      // If task is associated with a client/company, every association's company must be in access list.
      // Fail closed on malformed `associations` rows so a single bad row can't tank the whole batch read.
      const parsed = AssociationsSchema.safeParse(task.associations)
      if (!parsed.success) return false
      for (const association of parsed.data || []) {
        if (!companyAccessList.includes(association.companyId)) {
          return false
        }
      }
      return true
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
        const company = await this.copilot.getCompany(association.companyId)
        if (company.isPlaceholder) {
          throw new APIError(httpStatus.BAD_REQUEST, 'Invalid companyId for the provided association.')
        }
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
      // replaces src in both (outer <div data-src="..."> + inner <attachment-view src="...">)
      htmlString = htmlString.replaceAll(originalSrc, newUrl)
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
    const { id: parentId, internalUserId, clientId, companyId, associations, isShared } = parentTask

    try {
      const createTaskPayload = CreateTaskRequestSchema.parse({
        title: resolveDynamicFields(title),
        body: body ? resolveAutofillTags(body) : body,
        workspaceId,
        workflowStateId,
        parentId,
        templateId: undefined, //just to be safe from circular recursion
        internalUserId,
        clientId,
        companyId,
        associations,
        isShared,
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
    const hasAssociations = Array.isArray(finalAssociations) && finalAssociations.length > 0

    if (!hasInternalUser || !hasAssociations) {
      throw new APIError(
        httpStatus.BAD_REQUEST,
        'Cannot share task. A task must have an internal user and at least one association to be shared.',
      )
    }

    return true
  }

  protected async resolveAssociations(params: {
    prevTask: Task
    data: UpdateTaskRequest
    shouldUpdateUserIds: boolean
    clientId?: string | null
    companyId?: string | null
  }): Promise<Associations> {
    const { prevTask, data, shouldUpdateUserIds, clientId, companyId } = params
    if (!data.associations) {
      return AssociationsSchema.parse(prevTask.associations)
    }

    const shouldReset = this.shouldResetAssociations({
      shouldUpdateUserIds,
      prevTask,
      clientId,
      companyId,
    })

    if (shouldReset) return []

    const parsed = AssociationsSchema.parse(data.associations)

    if (!parsed?.length) return []

    return this.validateAssociations(parsed)
  }

  private shouldResetAssociations(params: {
    shouldUpdateUserIds: boolean
    prevTask: Task
    clientId?: string | null
    companyId?: string | null
  }): boolean {
    const { shouldUpdateUserIds, prevTask, clientId, companyId } = params

    if (shouldUpdateUserIds) {
      return !!clientId || !!companyId
    }

    return !!prevTask.clientId || !!prevTask.companyId
  }
}
