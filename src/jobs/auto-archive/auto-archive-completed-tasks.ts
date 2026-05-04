import DBClient from '@/lib/db'
import { ActivityType, AssigneeType } from '@prisma/client'
import { logger, schedules } from '@trigger.dev/sdk/v3'

const BATCH_SIZE = 200

type ArchivedTaskRow = { id: string }

export const autoArchiveCompletedTasks = schedules.task({
  id: 'auto-archive-completed-tasks',
  cron: '0 2 * * *',
  maxDuration: 3000,
  run: async (payload) => {
    const db = DBClient.getInstance()

    // $queryRaw bypasses the global filterSoftDeleted Prisma extension, which would
    // otherwise inject `deletedAt: null` into the where clause. WorkspaceSettings has no
    // deletedAt column; here, autoArchiveAfterDays = 0 already represents "disabled".
    const workspaces = await db.$queryRaw<{ workspaceId: string; autoArchiveAfterDays: number }[]>`
      SELECT "workspaceId", "autoArchiveAfterDays"
      FROM "WorkspaceSettings"
      WHERE "autoArchiveAfterDays" > 0
    `

    logger.log('Auto-archive sweep starting', {
      workspaceCount: workspaces.length,
      runAt: payload.timestamp,
    })

    let totalArchived = 0

    for (const { workspaceId, autoArchiveAfterDays } of workspaces) {
      try {
        let workspaceArchived = 0

        while (true) {
          // Single statement does three things atomically per batch:
          //   1. Pick eligible parents (top-level, completed, aged past threshold, no incomplete direct subtasks).
          //   2. Cascade to their completed unarchived descendants via ltree path.
          //   3. UPDATE all of them and RETURN their ids so we can write activity logs.
          // Subtasks are never independently eligible — they archive only via cascade from a qualifying ancestor.
          // archivedBy = NULL marks this as an automated archive (manual sets it to a userId).
          const archivedRows = await db.$queryRaw<ArchivedTaskRow[]>`
            WITH eligible_parents AS (
              SELECT t.id, t.path
              FROM "Tasks" t
              JOIN "WorkflowStates" ws ON ws.id = t."workflowStateId"
              WHERE t."workspaceId" = ${workspaceId}
                AND t."parentId" IS NULL
                AND ws."type" = 'completed'::"StateType"
                AND t."isArchived" = false
                AND t."deletedAt" IS NULL
                AND t."completedAt" IS NOT NULL
                AND t."completedAt" < NOW() - (${autoArchiveAfterDays}::int * INTERVAL '1 day')
                AND NOT EXISTS (
                  SELECT 1
                  FROM "Tasks" sub
                  JOIN "WorkflowStates" sub_ws ON sub_ws.id = sub."workflowStateId"
                  WHERE sub."parentId" = t.id
                    AND sub."isArchived" = false
                    AND sub."deletedAt" IS NULL
                    AND sub_ws."type" <> 'completed'::"StateType"
                )
              LIMIT ${BATCH_SIZE}
            ),
            cascade_targets AS (
              SELECT id FROM eligible_parents
              UNION
              SELECT t.id
              FROM "Tasks" t
              JOIN "WorkflowStates" ws ON ws.id = t."workflowStateId"
              WHERE t."workspaceId" = ${workspaceId}
                AND t."isArchived" = false
                AND t."deletedAt" IS NULL
                AND ws."type" = 'completed'::"StateType"
                AND t.path IS NOT NULL
                AND EXISTS (
                  SELECT 1 FROM eligible_parents ep
                  WHERE ep.path IS NOT NULL
                    AND t.path <@ ep.path
                    AND t.id <> ep.id
                )
            ),
            archived AS (
              UPDATE "Tasks"
              SET "isArchived" = true,
                  "lastArchivedDate" = NOW(),
                  "lastActivityLogUpdated" = NOW(),
                  "archivedBy" = NULL
              WHERE id IN (SELECT id FROM cascade_targets)
              RETURNING id
            )
            SELECT id::text AS id FROM archived
          `

          const batchCount = archivedRows.length
          if (batchCount === 0) break

          // System-initiated archive: userId=null. The activity log UI renders this as
          // "Task was auto-archived". userRole=internalUser keeps the entry visible to
          // clients via the existing isIuLog filter.
          await db.activityLog.createMany({
            data: archivedRows.map((row) => ({
              taskId: row.id,
              workspaceId,
              type: ActivityType.ARCHIVE_STATE_UPDATED,
              details: { oldValue: false, newValue: true },
              userId: null,
              userRole: AssigneeType.internalUser,
            })),
          })

          workspaceArchived += batchCount
        }

        if (workspaceArchived > 0) {
          logger.log('Workspace auto-archive complete', {
            workspaceId,
            archivedCount: workspaceArchived,
            autoArchiveAfterDays,
          })
        }

        totalArchived += workspaceArchived
      } catch (err) {
        // Per-workspace isolation: a failed workspace shouldn't abort the rest of the sweep.
        logger.error('Auto-archive failed for workspace', {
          workspaceId,
          error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
        })
      }
    }

    logger.log('Auto-archive sweep complete', {
      totalArchived,
      workspaceCount: workspaces.length,
    })

    return { totalArchived, workspaceCount: workspaces.length }
  },
})
