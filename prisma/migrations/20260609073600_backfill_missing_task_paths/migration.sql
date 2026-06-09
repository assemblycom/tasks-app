WITH RECURSIVE task_paths AS (
  SELECT
    id,
    "parentId",
    "workspaceId",
    replace(id::text, '-', '_')::ltree AS path
  FROM "Tasks"
  WHERE "parentId" IS NULL

  UNION ALL

  SELECT
    child.id,
    child."parentId",
    child."workspaceId",
    parent.path || replace(child.id::text, '-', '_')::ltree AS path
  FROM "Tasks" child
  JOIN task_paths parent
    ON child."parentId" = parent.id
    AND child."workspaceId" = parent."workspaceId"
)
UPDATE "Tasks" task
SET path = task_paths.path
FROM task_paths
WHERE task.id = task_paths.id
  AND task."workspaceId" = task_paths."workspaceId"
  AND task.path IS NULL;
