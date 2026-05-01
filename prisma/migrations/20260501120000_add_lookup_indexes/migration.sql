-- ----------------------------------------------------------------------------
-- ⚠️  PRODUCTION ROLLOUT WARNING
-- ----------------------------------------------------------------------------
-- This migration creates btree indexes on large tables (Tasks, Comments,
-- ClientNotifications). Running plain `CREATE INDEX` takes an
-- ACCESS EXCLUSIVE-equivalent lock and will BLOCK WRITES for the duration
-- of the index build — minutes of downtime on multi-million-row tables.
--
-- ✅ For local / staging:   `bun prisma migrate dev` (this file is fine).
-- ⚠️  For production:        DO NOT run via `prisma migrate deploy`.
--                            Follow `./README.md` to apply each statement
--                            with CREATE INDEX CONCURRENTLY, then mark this
--                            migration as applied with
--                            `prisma migrate resolve --applied 20260501120000_add_lookup_indexes`.
-- ----------------------------------------------------------------------------

-- CreateIndex
CREATE INDEX "IX_Tasks_workspaceId" ON "Tasks"("workspaceId");

-- CreateIndex
CREATE INDEX "IX_Tasks_assigneeId" ON "Tasks"("assigneeId");

-- CreateIndex
-- Composite for the tenant-scoped Tasks list ordering
-- (tasks.service.ts orderBy [dueDate, createdAt desc] inside a workspace).
CREATE INDEX "IX_Tasks_workspaceId_createdAt" ON "Tasks"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "IX_ClientNotifications_taskId" ON "ClientNotifications"("taskId");

-- CreateIndex
CREATE INDEX "IX_ClientNotifications_clientId" ON "ClientNotifications"("clientId");

-- CreateIndex
CREATE INDEX "IX_ClientNotifications_companyId" ON "ClientNotifications"("companyId");

-- CreateIndex
CREATE INDEX "IX_Comments_parentId" ON "Comments"("parentId");

-- CreateIndex
CREATE INDEX "IX_Comments_workspaceId" ON "Comments"("workspaceId");
