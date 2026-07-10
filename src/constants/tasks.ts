export const maxSubTaskDepth = 1

// Bounds how many subtasks we create concurrently when applying a template, so a
// template with many sub-templates can't exhaust the DB connection pool.
export const subtaskTemplateBatchSize = 10
