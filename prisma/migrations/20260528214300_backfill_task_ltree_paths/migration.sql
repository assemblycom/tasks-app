WITH RECURSIVE task_paths AS (
  SELECT
    id,
    "parentId",
    replace(lower(id::text), '-', '_')::ltree AS path
  FROM "Tasks"
  WHERE "parentId" IS NULL

  UNION ALL

  SELECT
    child.id,
    child."parentId",
    task_paths.path || replace(lower(child.id::text), '-', '_')::ltree AS path
  FROM "Tasks" child
  INNER JOIN task_paths ON child."parentId" = task_paths.id
)
UPDATE "Tasks"
SET path = task_paths.path
FROM task_paths
WHERE "Tasks".id = task_paths.id
  AND "Tasks".path IS NULL;
