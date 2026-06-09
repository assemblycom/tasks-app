import { buildLtreeNodeString, getIdsFromLtreePath } from '@/utils/ltree'
import APIError from '@api/core/exceptions/api'
import { PrismaClient } from '@prisma/client'
import httpStatus from 'http-status'

type TaskPathDb = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>

type TaskPathRow = {
  id: string
  parentId: string | null
  path: string | null
}

const MAX_TASK_PATH_DEPTH = 100

const getTaskPathRow = async (db: TaskPathDb, taskId: string, workspaceId: string): Promise<TaskPathRow | null> =>
  (
    await db.$queryRaw<TaskPathRow[]>`
      SELECT id::text, "parentId"::text, path::text
      FROM "Tasks"
      WHERE id = ${taskId}::uuid
        AND "workspaceId" = ${workspaceId}
      LIMIT 1
    `
  )?.[0] ?? null

export const getLtreePathFromIds = (taskIds: string[]) => taskIds.map(buildLtreeNodeString).join('.')

const persistResolvedPath = async (
  db: TaskPathDb,
  taskId: string,
  workspaceId: string,
  taskPathIds: string[],
): Promise<void> => {
  await db.$executeRaw`
    UPDATE "Tasks"
    SET path = ${getLtreePathFromIds(taskPathIds)}::ltree
    WHERE id = ${taskId}::uuid
      AND "workspaceId" = ${workspaceId}
      AND path IS NULL
  `
}

export const getTaskPathIds = async (db: TaskPathDb, taskId: string, workspaceId: string): Promise<string[]> => {
  let task = await getTaskPathRow(db, taskId, workspaceId)

  if (!task) {
    throw new APIError(httpStatus.NOT_FOUND, 'The requested task was not found')
  }

  const missingPathTaskIds = new Set<string>()
  const pendingDescendantIds: string[] = []

  for (let depth = 0; depth < MAX_TASK_PATH_DEPTH; depth++) {
    if (missingPathTaskIds.has(task.id)) {
      throw new APIError(httpStatus.INTERNAL_SERVER_ERROR, `Cycle detected while resolving task path for ${taskId}`)
    }

    if (task.path) {
      const resolvedPathIds = [...getIdsFromLtreePath(task.path), ...pendingDescendantIds.reverse()]
      if (pendingDescendantIds.length) {
        await persistResolvedPath(db, taskId, workspaceId, resolvedPathIds)
      }
      return resolvedPathIds
    }

    missingPathTaskIds.add(task.id)
    pendingDescendantIds.push(task.id)

    if (!task.parentId) {
      const resolvedPathIds = pendingDescendantIds.reverse()
      await persistResolvedPath(db, taskId, workspaceId, resolvedPathIds)
      return resolvedPathIds
    }

    const parentTask = await getTaskPathRow(db, task.parentId, workspaceId)
    if (!parentTask) {
      throw new APIError(httpStatus.NOT_FOUND, `Missing parent task ${task.parentId} in traversal path of ${taskId}`)
    }
    task = parentTask
  }

  throw new APIError(httpStatus.INTERNAL_SERVER_ERROR, `Exceeded max task path depth while resolving ${taskId}`)
}

export const getTaskPath = async (db: TaskPathDb, taskId: string, workspaceId: string): Promise<string> =>
  getLtreePathFromIds(await getTaskPathIds(db, taskId, workspaceId))
