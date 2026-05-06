-- CreateIndex
-- NOTE: Indexes created CONCURRENTLY in production via Supabase SQL editor
-- prior to this migration running. `IF NOT EXISTS` makes this a no-op there
-- and creates the indexes normally in lower environments.
CREATE INDEX IF NOT EXISTS "IX_Tasks_workspaceId" ON "Tasks"("workspaceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IX_Tasks_parentId" ON "Tasks"("parentId");


-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_Tasks_workspaceId" ON "Tasks"("workspaceId");
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_Tasks_parentId" ON "Tasks"("parentId");