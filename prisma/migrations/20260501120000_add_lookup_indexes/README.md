# Migration: add_lookup_indexes

Adds 8 btree indexes to support common lookups on `Tasks`, `Comments`, and `ClientNotifications`.

## Why this migration needs special handling

`Tasks` and `Comments` are large in production. A plain `CREATE INDEX` takes a heavy lock that blocks writes for the duration of the build — potentially many minutes of downtime. The fix is `CREATE INDEX CONCURRENTLY`, but that statement cannot run inside a transaction, and Prisma wraps every migration in a transaction.

So the rollout differs by environment.

## Local / staging

Just run the normal migration command. Plain `CREATE INDEX` is fast on small data and matches the existing migration style in this repo.

```bash
bun prisma migrate dev
```

## Production rollout

**Do not run `prisma migrate deploy` for this migration.** It will block writes.

Instead:

### 1. Apply each index manually with `CONCURRENTLY`

Connect to the production database (Supabase SQL editor, `psql`, whatever you normally use) and run **each statement in its own session, one at a time**:

```sql
CREATE INDEX CONCURRENTLY "IX_Tasks_workspaceId" ON "Tasks"("workspaceId");
CREATE INDEX CONCURRENTLY "IX_Tasks_assigneeId" ON "Tasks"("assigneeId");
CREATE INDEX CONCURRENTLY "IX_Tasks_workspaceId_createdAt" ON "Tasks"("workspaceId", "createdAt" DESC);
CREATE INDEX CONCURRENTLY "IX_ClientNotifications_taskId" ON "ClientNotifications"("taskId");
CREATE INDEX CONCURRENTLY "IX_ClientNotifications_clientId" ON "ClientNotifications"("clientId");
CREATE INDEX CONCURRENTLY "IX_ClientNotifications_companyId" ON "ClientNotifications"("companyId");
CREATE INDEX CONCURRENTLY "IX_Comments_parentId" ON "Comments"("parentId");
CREATE INDEX CONCURRENTLY "IX_Comments_workspaceId" ON "Comments"("workspaceId");
```

Notes:
- Run each statement separately. `CONCURRENTLY` is incompatible with explicit transaction blocks; wrapping multiple `CONCURRENTLY` statements in `BEGIN/COMMIT` will fail.
- If a `CONCURRENTLY` build is interrupted, Postgres leaves an `INVALID` index behind. Drop it (`DROP INDEX CONCURRENTLY "<name>"`) before retrying.
- Build progress is visible in `pg_stat_progress_create_index` while it runs.

### 2. Mark the migration as applied in Prisma's history

After every index is built, tell Prisma not to try running the migration:

```bash
bun prisma migrate resolve --applied 20260501120000_add_lookup_indexes
```

This inserts a row into `_prisma_migrations` so future `migrate deploy` runs skip this migration.

### 3. Verify

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE indexname LIKE 'IX_Tasks_%'
   OR indexname LIKE 'IX_Comments_%'
   OR indexname LIKE 'IX_ClientNotifications_%';
```

Then run `EXPLAIN ANALYZE` on a representative query and confirm the planner picked the new index:

```sql
EXPLAIN ANALYZE
SELECT * FROM "Tasks"
WHERE "workspaceId" = '<real-workspace-id>' AND "deletedAt" IS NULL;
```

Look for `Index Scan using "IX_Tasks_workspaceId"` (or the composite) instead of `Seq Scan`.

## Post-rollout monitoring

After ~1 week of traffic, check which indexes are actually being used:

```sql
SELECT relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE indexrelname LIKE 'IX_Tasks_%'
   OR indexrelname LIKE 'IX_Comments_%'
   OR indexrelname LIKE 'IX_ClientNotifications_%'
ORDER BY idx_scan ASC;
```

Indexes with `idx_scan = 0` after sustained traffic are dead weight — drop them.

Suspected low-value entries to watch:
- `IX_ClientNotifications_companyId` — current code paths always pair it with `clientId`, so the `clientId` index covers them.
- `IX_Comments_workspaceId` — no production query I found filters by `workspaceId` alone on Comments; tenant filter is always combined with `taskId` or `parentId`.
