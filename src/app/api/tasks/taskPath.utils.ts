import { PrismaClient } from '@prisma/client'

type TaskPathRow = {
  path: string | null
}

const MAX_TASK_PATH_DEPTH = 32

export const getTaskPath = async (db: PrismaClient, workspaceId: string, taskId: string): Promise<string | null> => {
  const taskPath = (
    await db.$queryRaw<TaskPathRow[]>`
      SELECT "path"::text AS path
      FROM "Tasks"
      WHERE id = ${taskId}::uuid
        AND "workspaceId" = ${workspaceId}
      LIMIT 1
    `
  )[0]?.path

  if (taskPath) {
    return taskPath
  }

  if (taskPath === undefined) {
    return null
  }

  return backfillMissingTaskPath(db, workspaceId, taskId)
}

const backfillMissingTaskPath = async (
  db: PrismaClient,
  workspaceId: string,
  taskId: string,
): Promise<string | null> => {
  const backfilledPath = (
    await db.$queryRaw<TaskPathRow[]>`
      WITH RECURSIVE ancestors AS (
        SELECT
          id,
          "parentId",
          replace(lower(id::text), '-', '_') AS path,
          1 AS depth
        FROM "Tasks"
        WHERE id = ${taskId}::uuid
          AND "workspaceId" = ${workspaceId}

        UNION ALL

        SELECT
          parent.id,
          parent."parentId",
          replace(lower(parent.id::text), '-', '_') || '.' || ancestors.path AS path,
          ancestors.depth + 1 AS depth
        FROM "Tasks" parent
        JOIN ancestors ON ancestors."parentId" = parent.id
        WHERE parent."workspaceId" = ${workspaceId}
          AND ancestors.depth < ${MAX_TASK_PATH_DEPTH}
      ),
      target_path AS (
        SELECT path
        FROM ancestors
        WHERE "parentId" IS NULL
        ORDER BY depth DESC
        LIMIT 1
      ),
      updated AS (
        UPDATE "Tasks"
        SET path = target_path.path::ltree
        FROM target_path
        WHERE "Tasks".id = ${taskId}::uuid
          AND "Tasks"."workspaceId" = ${workspaceId}
          AND "Tasks".path IS NULL
        RETURNING "Tasks".path::text AS path
      )
      SELECT path FROM updated
      UNION ALL
      SELECT path FROM target_path
      LIMIT 1
    `
  )[0]?.path

  return backfilledPath ?? null
}
