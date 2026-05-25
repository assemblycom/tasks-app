/**
 * Normalize an Attachment.filePath / Supabase object path for comparison.
 * Different code paths produce paths with or without a leading slash
 * (e.g., buildFilePath returns "/{workspaceId}", but Supabase's stored
 * object path comes back without the leading slash). Strip it so equality
 * checks behave predictably regardless of the source.
 */
export const normalizeAttachmentFilePath = (filePath: string): string => {
  return filePath.replace(/^\/+/, '')
}
