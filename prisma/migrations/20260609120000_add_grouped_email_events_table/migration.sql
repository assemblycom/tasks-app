-- CreateEnum
CREATE TYPE "GroupedEmailEventType" AS ENUM ('ASSIGNED', 'SHARED', 'COMMENT', 'COMPLETED');

-- CreateTable
CREATE TABLE "GroupedEmailEvents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" VARCHAR(32) NOT NULL,
    "recipientClientId" UUID,
    "recipientCompanyId" UUID,
    "recipientIuId" UUID,
    "eventType" "GroupedEmailEventType" NOT NULL,
    "taskId" UUID NOT NULL,
    "taskTitleSnapshot" VARCHAR(255) NOT NULL,
    "commentId" UUID,
    "windowKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "batchId" UUID,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "GroupedEmailEvents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroupedEmailEvents_windowKey_eventType_taskId_commentId_key" ON "GroupedEmailEvents"("windowKey", "eventType", "taskId", "commentId") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "GroupedEmailEvents_workspaceId_sentAt_idx" ON "GroupedEmailEvents"("workspaceId", "sentAt");

-- AddForeignKey
ALTER TABLE "GroupedEmailEvents" ADD CONSTRAINT "GroupedEmailEvents_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
