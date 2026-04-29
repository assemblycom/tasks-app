import DBClient from '@/lib/db'
import { logger, schedules } from '@trigger.dev/sdk/v3'

const BATCH_SIZE = 1000

export const autoArchiveCompletedTasks = schedules.task({
  id: 'auto-archive-completed-tasks',
  cron: '0 2 * * *',
  maxDuration: 3000,
  run: async (payload) => {
    const db = DBClient.getInstance()

    const workspaces = await db.workspaceSetting.findMany({
      where: { autoArchiveAfterDays: { gt: 0 } },
      select: { workspaceId: true, autoArchiveAfterDays: true },
    })

    logger.log('Auto-archive sweep starting', {
      workspaceCount: workspaces.length,
      runAt: payload.timestamp,
    })

    let totalArchived = 0

    for (const { workspaceId, autoArchiveAfterDays } of workspaces) {
      let workspaceArchived = 0
      let batchCount = 0

      do {
        // Bounded UPDATE keeps each transaction small and memory predictable.
        // Idempotent: re-running on the same day matches no rows once swept.
        // archivedBy = NULL marks this as an automated archive (manual sets it to a userId).
        batchCount = await db.$executeRaw`
          UPDATE "Tasks"
          SET "isArchived" = true,
              "lastArchivedDate" = NOW(),
              "archivedBy" = NULL
          WHERE id IN (
            SELECT t.id
            FROM "Tasks" t
            JOIN "WorkflowStates" ws ON ws.id = t."workflowStateId"
            WHERE t."workspaceId" = ${workspaceId}
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
          )
        `

        workspaceArchived += batchCount
      } while (batchCount === BATCH_SIZE)

      if (workspaceArchived > 0) {
        logger.log('Workspace auto-archive complete', {
          workspaceId,
          archivedCount: workspaceArchived,
          autoArchiveAfterDays,
        })
      }

      totalArchived += workspaceArchived
    }

    logger.log('Auto-archive sweep complete', {
      totalArchived,
      workspaceCount: workspaces.length,
    })

    return { totalArchived, workspaceCount: workspaces.length }
  },
})
