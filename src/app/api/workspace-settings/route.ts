import { withErrorHandler } from '@api/core/utils/withErrorHandler'
import { getWorkspaceSettings, updateWorkspaceSettings } from '@api/workspace-settings/workspaceSettings.controller'

export const GET = withErrorHandler(getWorkspaceSettings)
export const PATCH = withErrorHandler(updateWorkspaceSettings)
