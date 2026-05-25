import DBClient from '@/lib/db'
import { AssigneeType, TaskReminderType } from '@prisma/client'

export type EligibilityRow = {
  taskId: string
  workspaceId: string
  title: string
  createdById: string
  assigneeId: string
  assigneeType: AssigneeType
  // companyId derivation per assigneeType:
  //   client → task.companyId    (disambiguates which company "hat" the client wears)
  //   company → assigneeId       (the company IS the assignee)
  //   internalUser → null        (IUs don't receive email reminders)
  companyId: string | null
  reminderType: TaskReminderType
}

/**
 * Returns one row per (task, assignee, reminderType) eligible for a reminder today.
 *
 * Company-assigned tasks emit a single row with assigneeType='company' and assigneeId
 * set to the company id. Caller fans those out to individual members via Copilot —
 * the SQL deliberately stops at the company boundary so DB has no Copilot dependency.
 *
 * Already-sent reminders are NOT filtered here. The TaskReminderSents unique constraint
 * is the dedupe primitive at insert time, so a retried cron run is idempotent without
 * an extra NOT EXISTS check (the windows are exact-day so day-N reminders don't repeat
 * in normal operation).
 */
export const getEligibleReminders = async (db: ReturnType<typeof DBClient.getInstance>): Promise<EligibilityRow[]> => {
  return db.$queryRaw<EligibilityRow[]>`
    SELECT
      t.id::text AS "taskId",
      t."workspaceId",
      t."title",
      t."createdById"::text AS "createdById",
      t."assigneeId"::text AS "assigneeId",
      t."assigneeType" AS "assigneeType",
      (CASE
        WHEN t."assigneeType" = 'company' THEN t."assigneeId"::text
        WHEN t."assigneeType" = 'client'  THEN t."companyId"::text
        ELSE NULL
      END) AS "companyId",
      (CASE
        WHEN t."dueDate" IS NULL AND t."assignedAt"::date = CURRENT_DATE - 3 THEN 'NO_DUE_DATE_3D'
        WHEN t."dueDate" IS NULL AND t."assignedAt"::date = CURRENT_DATE - 7 THEN 'NO_DUE_DATE_7D'
        WHEN t."dueDate"::date = CURRENT_DATE + 3                            THEN 'DUE_DATE_BEFORE_3D'
        WHEN t."dueDate"::date = CURRENT_DATE                                THEN 'DUE_DATE_TODAY'
        WHEN t."dueDate"::date = CURRENT_DATE - 3                            THEN 'DUE_DATE_OVERDUE_3D'
        WHEN t."dueDate"::date = CURRENT_DATE - 7                            THEN 'DUE_DATE_OVERDUE_7D'
      END)::"TaskReminderType" AS "reminderType"
    FROM "Tasks" t
    -- Only join "alive" parents. The carve-out below folds same-assignee subtasks
    -- into the parent's reminder, which is only meaningful when the parent itself
    -- is eligible for one. For soft-deleted / archived / completed parents the join
    -- returns NULL, which IS DISTINCT FROM any real assigneeId, so the subtask
    -- correctly emits its own reminder.
    LEFT JOIN "Tasks" parent
      ON parent.id = t."parentId"
      AND parent."deletedAt" IS NULL
      AND parent."isArchived" = false
      AND parent."completedAt" IS NULL
    WHERE t."deletedAt" IS NULL
      AND t."isArchived" = false
      AND t."completedAt" IS NULL
      AND t."assigneeId" IS NOT NULL
      AND t."assigneeType" IS NOT NULL
      -- Subtask carve-out: same-assignee subtasks fold into the parent reminder.
      -- A NULL parent.assigneeId counts as "different" so a standalone subtask under
      -- an unassigned parent (or under a dead parent, per the join filter above)
      -- still gets a reminder.
      AND (t."parentId" IS NULL OR parent."assigneeId" IS DISTINCT FROM t."assigneeId")
      -- Guard against malformed VARCHAR(10) dueDate values. The regex check and the
      -- ::date cast must live in a single CASE WHEN: Postgres doesn't guarantee AND
      -- predicate order, so the cast could run before a separate regex AND filters
      -- the row out. CASE WHEN evaluates sequentially and short-circuits.
      AND (
        (t."dueDate" IS NULL AND t."assignedAt"::date IN (CURRENT_DATE - 3, CURRENT_DATE - 7))
        OR (CASE WHEN t."dueDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             THEN t."dueDate"::date IN (CURRENT_DATE - 7, CURRENT_DATE - 3, CURRENT_DATE, CURRENT_DATE + 3)
             ELSE FALSE END)
      )
  `
}
