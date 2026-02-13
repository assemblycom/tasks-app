import { MAX_FETCH_ASSIGNEE_COUNT } from '@/constants/users'
import { AssociationsSchema, ViewerType } from '@/types/dto/tasks.dto'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { buildLtreeNodeString } from '@/utils/ltree'
import APIError from '@api/core/exceptions/api'
import { BaseService } from '@api/core/services/base.service'
import { UserRole } from '@api/core/types/user'
import { JsonValue } from '@prisma/client/runtime/library'
import httpStatus from 'http-status'
import { z } from 'zod'

interface Assignable {
  internalUserId: string | null
  clientId: string | null
  companyId: string | null
  associations: JsonValue[]
  isShared: boolean
}

export class SubtaskService extends BaseService {
  async getSubtaskCounts(id: string): Promise<number> {
    const taskId = z.string().uuid().parse(id)
    const level = (
      await this.db.$queryRaw<{ level: number }[] | null>`
      SELECT nlevel("path") as level FROM "Tasks"
      WHERE id = ${taskId}::uuid AND "workspaceId" = ${this.user.workspaceId}
    `
    )?.[0]?.level
    if (!level) {
      throw new APIError(httpStatus.INTERNAL_SERVER_ERROR, 'Path for task was not set')
    }
    return level
  }

  async addSubtaskCount(id: string, increment: number = 1) {
    await this.db.task.update({
      where: { id, workspaceId: this.user.workspaceId },
      data: { subtaskCount: { increment } },
    })
  }

  async decreaseSubtaskCount(id: string, decrement: number = 1) {
    await this.db.task.update({
      where: { id, workspaceId: this.user.workspaceId },
      data: { subtaskCount: { decrement } },
    })
  }

  /**
   * Soft-deletes all tasks where children have path derived from parent task's
   * @param id Parent Task id
   */
  async softDeleteAllSubtasks(id: string) {
    console.info('SubtasksService#deleteAllSubtasks | Deleting all subtasks for parent with id', id)

    const taskLabels = (
      await this.db.$queryRawUnsafe<Array<{ label: string }>>(
        `
          SELECT "label"
          FROM "Tasks"
          WHERE "deletedAt" IS NULL
            AND "workspaceId" = $1
            AND path @ '${buildLtreeNodeString(id)}'`,
        // Without injecting ltree path like this, Prisma throws an error....
        // even though the rendered SQL works fine when executed in a query console
        this.user.workspaceId,
      )
    ).map((row) => row.label)

    await this.db.task.deleteMany({ where: { label: { in: taskLabels } } })
    await this.db.label.deleteMany({ where: { label: { in: taskLabels } } })
  }

  /**
   * Marks archived / unarhived for all subtasks that are children of parent task
   */
  async toggleArchiveForAllSubtasks(id: string, archive: boolean) {
    console.info('SubtasksService#deleteAllSubtasks | Deleting all subtasks for parent with id', id)
    await this.db.$executeRawUnsafe(
      `
        UPDATE "Tasks"
        SET "isArchived" = $1, "lastArchivedDate" = ${archive ? 'NOW()' : 'NULL'}
        WHERE "deletedAt" IS NULL
          AND "workspaceId" = $2
          AND path @ '${buildLtreeNodeString(id)}'
      `,
      archive,
      this.user.workspaceId,
    )
  }

  async getAccessiblePathTasks<T extends Assignable>(tasks: T[]): Promise<T[]> {
    //  find the last index of the task that is unaccessible to the user
    //  return all tasks starting from index + 1 -> last value of tasks
    let latestAccessibleTaskIndex: number

    if (this.user.role === UserRole.IU) {
      const iu = await this.copilot.getInternalUser(z.string().parse(this.user.internalUserId))
      if (!iu.isClientAccessLimited) {
        return tasks
      }

      // If user is an internal user with client access limitations, they can only access tasks assigned to clients or company they have access to
      const clients = await this.copilot.getClients({ limit: MAX_FETCH_ASSIGNEE_COUNT })
      let companyIds: string[]
      latestAccessibleTaskIndex = tasks.findLastIndex((task) => {
        if (task.internalUserId) return false
        // Now find the last index of the task that is inaccessible to the user.
        // We can them return all tasks following this inacessible task
        else if (task.clientId) {
          const client = clients.data?.find((client) => client.id === task.clientId)
          if (!client || !client.companyIds?.length) {
            return true
          }
          companyIds = z
            .string()
            .array()
            .parse(client.companyIds)
            .filter((id) => iu.companyAccessList?.includes(id))
        } else {
          // company
          companyIds = task.companyId && iu.companyAccessList?.includes(task.companyId) ? [task.companyId] : []
        }
        return companyIds.length === 0
      })
    } else if (this.user.role === UserRole.Client) {
      // If user is a client, just check index of which task was last assigned to client
      latestAccessibleTaskIndex = tasks.findLastIndex((task) => {
        let viewer: ViewerType | undefined
        // check if viewer exists and parse and assign viewer
        if (Array.isArray(task.associations) && !!task.associations.length) {
          viewer = AssociationsSchema.parse(task.associations)?.[0]
        }

        return !(
          (task.clientId === this.user.clientId && task.companyId === this.user.companyId) ||
          (task.clientId === null && task.companyId === this.user.companyId) ||
          (viewer &&
            (!viewer?.clientId || viewer?.clientId === this.user.clientId) &&
            viewer.companyId === this.user.companyId &&
            task.isShared)
        )
      })
    } else {
      throw new APIError(httpStatus.BAD_REQUEST, 'Failed to parse user role from token')
    }
    return tasks.slice(latestAccessibleTaskIndex + 1)
  }
}
