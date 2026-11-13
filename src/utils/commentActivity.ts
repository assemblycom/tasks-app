export const getCommentActivityId = (details: { id?: unknown } | undefined): string | undefined =>
  typeof details?.id === 'string' && details.id.length > 0 ? details.id : undefined

export const isPendingCommentId = (commentId: string | undefined): boolean => commentId?.includes('temp-comment') ?? false
