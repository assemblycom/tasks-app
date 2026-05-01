# Migration: add_lookup_indexes

Adds 9 indexes (8 btree + 1 GIN) to support common lookups on `Tasks`, `Comments`, and `ClientNotifications`. Pairs with a `tasks.service.ts` refactor that pushes the client-access filter into SQL.

## What's in this migration

| Index | Table | Type | Purpose |
|---|---|---|---|
| `IX_Tasks_workspaceId` | Tasks | btree | Generic tenant filter |
| `IX_Tasks_assigneeId` | Tasks | btree | Webhook bulk operations |
| `IX_Tasks_workspaceId_isArchived_dueDate_createdAt` | Tasks | btree (composite) | Tasks list endpoint — exactly matches the WHERE + ORDER BY shape |
| `IX_Tasks_associations_gin` | Tasks | **GIN** (`jsonb_path_ops`) | JSONB containment queries (e.g. `associations: { hasSome: [...] }`) |
| `IX_ClientNotifications_taskId` | ClientNotifications | btree | Lookups by task |
| `IX_ClientNotifications_clientId` | ClientNotifications | btree | webhook bulk lookup by client |
| `IX_ClientNotifications_companyId` | ClientNotifications | btree | (low confidence — see "Post-rollout monitoring") |
| `IX_Comments_parentId` | Comments | btree | Reply lookups |
| `IX_Comments_workspaceId` | Comments | btree | (low confidence — see "Post-rollout monitoring") |

Note on the GIN index: Prisma cannot model `GIN` on `Json[]` in its schema. The `task.prisma` annotation intentionally omits it. `prisma migrate diff` will flag it as drift — that is intentional and expected.

## Paired code change

`src/app/api/tasks/tasks.service.ts#listTasks` no longer post-filters via `filterTasksByClientAccess` in JS. It now composes `getAccessFilterForTasks()` into the Prisma `where` via `AND`, so the client-access constraint is enforced in SQL. Same return shape, same task IDs — just less data fetched and filtered server-side.

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
CREATE INDEX CONCURRENTLY "IX_Tasks_workspaceId_isArchived_dueDate_createdAt"
  ON "Tasks"("workspaceId", "isArchived", "dueDate" ASC NULLS LAST, "createdAt" DESC);
CREATE INDEX CONCURRENTLY "IX_Tasks_associations_gin"
  ON "Tasks" USING GIN ("associations" jsonb_path_ops);
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
- The GIN build can be slower than a btree on the same row count — give it more time.

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

Then run `EXPLAIN ANALYZE` on representative queries:

```sql
-- Should pick the new composite — no separate Sort node above the Index Scan
EXPLAIN ANALYZE
SELECT * FROM "Tasks"
WHERE "workspaceId" = '<real-workspace-id>'
  AND "isArchived" = false
  AND "deletedAt" IS NULL
ORDER BY "dueDate" ASC NULLS LAST, "createdAt" DESC;

-- Should pick the GIN index, not Seq Scan
EXPLAIN ANALYZE
SELECT * FROM "Tasks"
WHERE "associations" @> '[{"companyId": "<some-uuid>"}]'::jsonb[]
  AND "deletedAt" IS NULL;
```

## Manual test plan (verify locally before merging)

This PR bundles index changes AND a service-layer refactor (`filterTasksByClientAccess` → SQL). All of the following should pass.

### A. Migration mechanics

- [ ] `bun prisma migrate dev` runs cleanly on a fresh local DB.
- [ ] `bun prisma generate` produces no schema drift other than the documented GIN drift on `Tasks.associations`.
- [ ] App boots (`bun dev`) with no Prisma errors at startup.

### B. Tasks list — happy path (no FE behavior change)

- [ ] As an internal user with `isClientAccessLimited = false`, open a board with ≥10 tasks across multiple workflow states. Same task IDs, same order as before this branch.
- [ ] Sort order: tasks with `dueDate` come first (ascending), tasks with no due date appear last, ties broken by `createdAt DESC`.
- [ ] Toggle "show archived" → archived tasks appear, ordered by the same rules.
- [ ] Open a single task detail (`/detail/<id>`) → loads correctly.
- [ ] Drag a task between columns → state moves persist after reload.
- [ ] Keyword search across `task.body` (the FE filter via `useFilter.tsx:106`) still works — confirms `body` is still in the response.

### C. Tasks list — client-access-limited IU (THIS IS THE CRITICAL CASE)

This is what the SQL refactor changes. The result set MUST be identical to the JS-filter version.

- [ ] Log in as an internal user where `isClientAccessLimited = true` and `companyAccessList = [companyA, companyB]`.
- [ ] Open the board. Confirm:
  - [ ] Tasks assigned to internalUsers (any IU, not just current) → visible.
  - [ ] Unassigned tasks (no internalUserId, no clientId, no companyId) → visible.
  - [ ] Tasks for clients/companies in companyA / companyB → visible.
  - [ ] Tasks for companies NOT in the access list → NOT visible.
- [ ] Disjoint subtask edge case: parent task is for a company OUTSIDE access list, subtask is for a company IN access list → the subtask must still surface as a root-level task in the board.
- [ ] Try opening a task detail URL by id for a task outside the access list → blocked by the existing `checkClientAccessForTask` policy gate (this hasn't changed).
- [ ] Empty access list (`companyAccessList = []`) for a restricted IU → board shows only IU-assigned tasks and unassigned tasks. No client/company tasks visible.

### D. CU portal users (clients / companies)

- [ ] Log in as a client → see only the tasks assigned to the client / their company / shared associations. Same set as before this PR.
- [ ] Log in as a company portal user → same.
- [ ] CU disjoint subtasks: parent task accessible to CU through associations but subtask not directly assigned → still surfaces as root-level. Same as before this PR.

### E. Webhook flows (touch the GIN index path)

- [ ] In Copilot, change a client's company association → tasks-app correctly moves the related tasks. Old client notifications are cleaned up.
- [ ] Delete a client → tasks for that client are deleted, shared tasks are reset, related notifications cleared.
- [ ] Create a task assigned to a company, then change the company → task moves correctly.

### F. Cross-cutting regressions

- [ ] Subtasks page renders correctly for both unrestricted and restricted IUs.
- [ ] Templates and view-settings unaffected (none of the touched code paths).
- [ ] Public API (`/api/tasks/public/*`) returns identical results — that path uses `getClientOrCompanyAssigneeFilter` directly and was not modified.

### G. Performance sanity check (optional but recommended)

- [ ] On a workspace with thousands of tasks where the user is an `isClientAccessLimited` IU, time the `/api/tasks` request before vs after this branch. Expect significant reduction (dropping the JS post-filter + smaller fetched row set + index-driven sort).
- [ ] Run the `EXPLAIN ANALYZE` queries in section "Verify" above. Confirm `Index Scan` (no `Seq Scan`).

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
- `IX_ClientNotifications_companyId` — current code paths always pair `companyId` with `clientId`, so the `clientId` index covers them.
- `IX_Comments_workspaceId` — no production query I found filters by `workspaceId` alone on Comments; tenant filter is always combined with `taskId` or `parentId`.
- `IX_Tasks_workspaceId` — superseded by the new composite `IX_Tasks_workspaceId_isArchived_dueDate_createdAt` for the list path. Other call sites still benefit from the standalone, but if it shows zero scans, it can go.
