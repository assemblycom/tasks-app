-- CreateEnum
CREATE TYPE "TaskReminderType" AS ENUM ('NO_DUE_DATE_3D', 'NO_DUE_DATE_7D', 'DUE_DATE_BEFORE_3D', 'DUE_DATE_TODAY', 'DUE_DATE_OVERDUE_3D', 'DUE_DATE_OVERDUE_7D');

-- CreateTable
CREATE TABLE "TaskReminderSents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "taskId" UUID NOT NULL,
    "workspaceId" VARCHAR(32) NOT NULL,
    "recipientId" UUID NOT NULL,
    "reminderType" "TaskReminderType" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskReminderSents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskReminderSents_taskId_recipientId_reminderType_key" ON "TaskReminderSents"("taskId", "recipientId", "reminderType");

-- AddForeignKey
ALTER TABLE "TaskReminderSents" ADD CONSTRAINT "TaskReminderSents_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
