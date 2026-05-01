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
-- Composite that matches the Tasks list endpoint's filter + ordering:
--   WHERE workspaceId = $1 AND isArchived = $2 AND deletedAt IS NULL
--   ORDER BY "dueDate" ASC NULLS LAST, "createdAt" DESC
-- See tasks.service.ts#listTasks. Plain (non-partial) so it stays in sync
-- with Prisma's @@index — Prisma can't model partial indexes.
CREATE INDEX "IX_Tasks_workspaceId_isArchived_dueDate_createdAt"
  ON "Tasks"("workspaceId", "isArchived", "dueDate" ASC NULLS LAST, "createdAt" DESC);

-- CreateIndex
-- GIN index for JSONB containment lookups on associations
-- (e.g. webhook.service.ts uses { associations: { hasSome: [{ companyId: ... }] } }).
-- Prisma cannot model GIN on Json[] in schema, so this lives only in SQL —
-- the schema file intentionally omits this index.
CREATE INDEX "IX_Tasks_associations_gin"
  ON "Tasks" USING GIN ("associations" jsonb_path_ops);

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
