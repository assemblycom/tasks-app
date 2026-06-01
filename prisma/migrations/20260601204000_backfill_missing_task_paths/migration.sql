-- Backfill task ltree paths that were missed by the original root-only path seed.
WITH RECURSIVE task_paths AS (
    SELECT
        id,
        "workspaceId",
        "parentId",
        replace(lower(id::text), '-', '_') AS path,
        1 AS depth
    FROM "Tasks"
    WHERE "parentId" IS NULL

    UNION ALL

    SELECT
        child.id,
        child."workspaceId",
        child."parentId",
        task_paths.path || '.' || replace(lower(child.id::text), '-', '_') AS path,
        task_paths.depth + 1 AS depth
    FROM "Tasks" child
    JOIN task_paths
        ON child."parentId" = task_paths.id
        AND child."workspaceId" = task_paths."workspaceId"
    WHERE task_paths.depth < 32
)
UPDATE "Tasks"
SET path = task_paths.path::ltree
FROM task_paths
WHERE "Tasks".id = task_paths.id
    AND "Tasks"."workspaceId" = task_paths."workspaceId"
    AND "Tasks".path IS NULL;
