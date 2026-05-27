import DBClient from '@/lib/db'
import { AssigneeType, TaskReminderType } from '@prisma/client'

export type EligibilityRow = {
  taskId: string
  workspaceId: string
  title: string
  createdById: string
  assigneeId: string
  assigneeType: AssigneeType
  companyId: string | null
  reminderType: TaskReminderType
}

// Company-assigned tasks emit one row at the company level; caller fans out to members.
// Already-sent reminders are not filtered here — TaskReminderSents' unique constraint is
// the dedupe primitive at insert time.
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
    -- Join only alive parents so dead parents act as if absent (NULL assigneeId),
    -- letting same-assignee subtasks under them emit their own reminder.
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
      -- Subtask carve-out: same-assignee subtasks fold into the parent's reminder.
      -- IS DISTINCT FROM treats a NULL parent as "different" so standalone subtasks still match.
      AND (t."parentId" IS NULL OR parent."assigneeId" IS DISTINCT FROM t."assigneeId")
      -- Regex + ::date cast must share a CASE WHEN: Postgres doesn't guarantee AND
      -- predicate order, so a separate regex guard could be reordered after the cast.
      AND (
        (t."dueDate" IS NULL AND t."assignedAt"::date IN (CURRENT_DATE - 3, CURRENT_DATE - 7))
        OR (CASE WHEN t."dueDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             THEN t."dueDate"::date IN (CURRENT_DATE - 7, CURRENT_DATE - 3, CURRENT_DATE, CURRENT_DATE + 3)
             ELSE FALSE END)
      )
  `
}
