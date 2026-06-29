import DBClient from '@/lib/db'
import { ActivityType, AssigneeType } from '@prisma/client'
import { logger, schedules } from '@trigger.dev/sdk/v3'
import Bottleneck from 'bottleneck'

import { dispatchTaskArchivedWebhook } from './dispatch-task-archived-webhook'

const BATCH_SIZE = 200
// Workspaces processed in parallel. Each worker's UPDATE filters by workspaceId so there's
// no cross-workspace lock contention; the cap exists to bound DB connections and queue
// pressure on the dispatcher task. Webhook throughput is governed by the dispatcher's own
// concurrency cap, not by this number.
const WORKSPACE_CONCURRENCY = 5

type ArchivedRow = { id: string }

export const autoArchiveCompletedTasks = schedules.task({
  id: 'auto-archive-completed-tasks',
  cron: '0 2 * * *',
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1_000, maxTimeoutInMs: 15_000, randomize: true },
  maxDuration: 3000,
  run: async (payload) => {
    const db = DBClient.getInstance()
    const workspaceBottleneck = new Bottleneck({ maxConcurrent: WORKSPACE_CONCURRENCY })

    // Pre-flight: full eligibility walk (parents + cascaded ltree descendants) per workspace.
    // Returns only workspaces with at least one task to archive — empties are skipped at
    // prod scale where most workspaces have nothing to do. The per-workspace counts also
    // give us exact `totalTasksToArchive` and `totalParents` denominators upfront.
    // $queryRaw bypasses the global filterSoftDeleted Prisma extension; WorkspaceSettings
    // has no deletedAt column and autoArchiveAfterDays = 0 already represents "disabled".
    const workspaces = await db.$queryRaw<
      { workspaceId: string; autoArchiveAfterDays: number; taskCount: number; parentCount: number }[]
    >`
      WITH eligible_parents AS (
        SELECT t.id, t.path, t."workspaceId"
        FROM "Tasks" t
        JOIN "WorkflowStates" ws ON ws.id = t."workflowStateId"
        JOIN "WorkspaceSettings" wss ON wss."workspaceId" = t."workspaceId"
        WHERE wss."autoArchiveAfterDays" > 0
          AND t."parentId" IS NULL
          AND ws."type" = 'completed'::"StateType"
          AND t."isArchived" = false
          AND t."deletedAt" IS NULL
          AND t."completedAt" IS NOT NULL
          AND t."completedAt" < NOW() - (wss."autoArchiveAfterDays" * INTERVAL '1 day')
          AND NOT EXISTS (
            SELECT 1
            FROM "Tasks" sub
            JOIN "WorkflowStates" sub_ws ON sub_ws.id = sub."workflowStateId"
            WHERE sub."parentId" = t.id
              AND sub."isArchived" = false
              AND sub."deletedAt" IS NULL
              AND sub_ws."type" <> 'completed'::"StateType"
          )
      ),
      all_targets AS (
        SELECT id, "workspaceId", true AS is_parent FROM eligible_parents
        UNION ALL
        SELECT t.id, t."workspaceId", false AS is_parent
        FROM "Tasks" t
        JOIN "WorkflowStates" ws ON ws.id = t."workflowStateId"
        WHERE t."isArchived" = false
          AND t."deletedAt" IS NULL
          AND ws."type" = 'completed'::"StateType"
          AND t.path IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM eligible_parents ep
            WHERE ep."workspaceId" = t."workspaceId"
              AND ep.path IS NOT NULL
              AND t.path <@ ep.path
              AND t.id <> ep.id
          )
      )
      SELECT
        at."workspaceId",
        wss."autoArchiveAfterDays",
        COUNT(*)::int AS "taskCount",
        COUNT(*) FILTER (WHERE at.is_parent)::int AS "parentCount"
      FROM all_targets at
      JOIN "WorkspaceSettings" wss ON wss."workspaceId" = at."workspaceId"
      GROUP BY at."workspaceId", wss."autoArchiveAfterDays"
    `

    const totalTasksToArchive = workspaces.reduce((sum, w) => sum + (w.taskCount ?? 0), 0)
    const totalParents = workspaces.reduce((sum, w) => sum + (w.parentCount ?? 0), 0)

    logger.log('Auto-archive sweep starting', {
      eligibleWorkspaces: workspaces.length,
      totalTasksToArchive,
      totalParents,
      workspaceConcurrency: WORKSPACE_CONCURRENCY,
      runAt: payload.timestamp,
    })

    let totalArchived = 0
    let workspacesProcessed = 0

    await Promise.allSettled(
      workspaces.map(({ workspaceId, autoArchiveAfterDays }) =>
        workspaceBottleneck.schedule(async () => {
          let workspaceArchived = 0
          try {
            while (true) {
              const archivedRows = await archiveBatch(db, workspaceId, autoArchiveAfterDays)
              if (archivedRows.length === 0) break

              // One task.archived webhook per archived task — parents and their cascaded
              // descendants. Enqueueing is fire-and-forget; Trigger.dev owns retry/backoff
              // for delivery from here on.
              try {
                await dispatchTaskArchivedWebhook.batchTrigger(
                  archivedRows.map((row) => ({ payload: { taskId: row.id, workspaceId } })),
                )
              } catch (err) {
                // Enqueue failure is logged but doesn't roll back the archive: the rows
                // are durably archived + logged in DB. Recovery is a manual re-trigger
                // for affected workspaces.
                logger.error('Failed to enqueue task.archived dispatchers', {
                  workspaceId,
                  taskCount: archivedRows.length,
                  error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
                })
              }

              workspaceArchived += archivedRows.length
            }
          } catch (err) {
            // Per-workspace isolation: a failed workspace shouldn't abort the rest of the sweep.
            logger.error('Auto-archive failed for workspace', {
              workspaceId,
              error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
            })
          } finally {
            // Increments are safe between awaits — JS is single-threaded so two parallel
            // workers cannot interleave a read-modify-write on these counters. Logging in
            // `finally` ensures progress is reported even when a workspace failed.
            totalArchived += workspaceArchived
            workspacesProcessed += 1
            logger.log(
              `[${workspacesProcessed}/${workspaces.length}] workspace ${workspaceId}: archived ${workspaceArchived} tasks (${totalArchived}/${totalTasksToArchive} total)`,
              {
                workspaceId,
                workspaceArchived,
                workspacesProcessed,
                eligibleWorkspaces: workspaces.length,
                totalArchivedSoFar: totalArchived,
                totalTasksToArchive,
                autoArchiveAfterDays,
              },
            )
          }
        }),
      ),
    )

    logger.log('Auto-archive sweep complete', {
      totalArchived,
      totalTasksToArchive,
      workspaceCount: workspaces.length,
    })

    return { totalArchived, workspaceCount: workspaces.length }
  },
})

// Archives one batch of eligible parents + their cascaded descendants and writes activity
// logs for them, atomically. Wrapped in a $transaction so the UPDATE and createMany commit
// together — without it, a failure on the activityLog insert leaves rows archived in DB
// with no log entry (the silent partial-success bug we hit during load testing).
const archiveBatch = async (
  db: ReturnType<typeof DBClient.getInstance>,
  workspaceId: string,
  autoArchiveAfterDays: number,
): Promise<ArchivedRow[]> =>
  db.$transaction(async (tx) => {
    // Single statement does three things atomically per batch:
    //   1. Pick eligible parents (top-level, completed, aged past threshold, no incomplete direct subtasks).
    //   2. Cascade to their completed unarchived descendants via ltree path.
    //   3. UPDATE all of them and RETURN their ids so we can write activity logs and enqueue webhooks.
    // Subtasks are never independently eligible — they archive only via cascade from a qualifying ancestor.
    // archivedBy = NULL marks this as an automated archive (manual archive sets it to a userId).
    const archivedRows = await tx.$queryRaw<ArchivedRow[]>`
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
        UNION ALL
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

    if (archivedRows.length === 0) return archivedRows

    // System-initiated archive: userId=null. The activity log UI renders this as "Task was
    // auto-archived". userRole=internalUser keeps the entry visible to clients via the
    // existing isIuLog filter.
    await tx.activityLog.createMany({
      data: archivedRows.map((row) => ({
        taskId: row.id,
        workspaceId,
        type: ActivityType.ARCHIVE_STATE_UPDATED,
        details: { oldValue: false, newValue: true },
        userId: null,
        userRole: AssigneeType.internalUser,
      })),
    })

    return archivedRows
  })
