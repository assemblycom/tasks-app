import { withErrorHandler } from '@api/core/utils/withErrorHandler'
import { updateWorkflowState } from '@api/workflow-states/[id]/workflowStates.controller'

export const PATCH = withErrorHandler(updateWorkflowState)
