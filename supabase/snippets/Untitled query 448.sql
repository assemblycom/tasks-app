  CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_Tasks_workspaceId" ON "Tasks"("workspaceId");
  CREATE INDEX CONCURRENTLY IF NOT EXISTS "IX_Tasks_parentId" ON "Tasks"("parentId");