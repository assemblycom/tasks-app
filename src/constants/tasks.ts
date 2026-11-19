export const maxSubTaskDepth = 1

// Production Prisma pool limit is 2; each subtask creation performs multiple DB
// writes, so keep template application serial within a single request.
export const subtaskTemplateBatchSize = 1
