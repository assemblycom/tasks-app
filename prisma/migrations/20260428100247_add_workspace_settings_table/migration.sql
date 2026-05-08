-- CreateTable
CREATE TABLE "WorkspaceSettings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId" VARCHAR(32) NOT NULL,
    "autoArchiveAfterDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "WorkspaceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSettings_workspaceId_key" ON "WorkspaceSettings"("workspaceId");
