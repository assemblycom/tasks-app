import DBClient from '@/lib/db'
import { AssigneeType, TaskReminderType } from '@prisma/client'

export type EligibilityRow = {
  taskId: string
  workspaceId: string
  assigneeId: string
  assigneeType: AssigneeType
  /**
   * Company context for the recipient.
   * - assigneeType='client'      → task.companyId (a client may belong to multiple companies on Copilot;
   *                                this disambiguates which "hat" they're wearing for this task)
   * - assigneeType='company'     → assigneeId (the company IS the assignee; caller fans out to members)
   * - assigneeType='internalUser'→ null (IUs have no company concept and never receive email notifications)
   *
   * Required for ClientNotifications inserts (unique key includes companyId) and for
   * Copilot's recipientCompanyId on email-bearing notifications. See
   * src/app/api/notification/notification.service.ts:558.
   */
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
    LEFT JOIN "Tasks" parent ON parent.id = t."parentId"
    WHERE t."deletedAt" IS NULL
      AND t."isArchived" = false
      AND t."completedAt" IS NULL
      AND t."assigneeId" IS NOT NULL
      AND t."assigneeType" IS NOT NULL
      -- Subtask carve-out: same-assignee subtasks fold into the parent reminder.
      -- A NULL parent.assigneeId counts as "different" so a standalone subtask under
      -- an unassigned parent still gets a reminder.
      AND (t."parentId" IS NULL OR parent."assigneeId" IS DISTINCT FROM t."assigneeId")
      -- Guard against malformed VARCHAR(10) dueDate values: only cast when the string
      -- looks like ISO YYYY-MM-DD. Without this, a single bad row poisons the whole query.
      AND (t."dueDate" IS NULL OR t."dueDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      AND (
        (t."dueDate" IS NULL AND t."assignedAt"::date IN (CURRENT_DATE - 3, CURRENT_DATE - 7))
        OR t."dueDate"::date IN (CURRENT_DATE - 7, CURRENT_DATE - 3, CURRENT_DATE, CURRENT_DATE + 3)
      )
  `
}
