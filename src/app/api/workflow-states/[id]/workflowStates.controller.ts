import { NextRequest, NextResponse } from 'next/server'
import WorkflowStatesService from '@api/workflow-states/workflowStates.service'
import { UpdateWorkflowStateRequestSchema } from '@/types/dto/workflowStates.dto'
import authenticate from '@api/core/utils/authenticate'
import { IdParams } from '@api/core/types/api'

export const updateWorkflowState = async (req: NextRequest, { params }: IdParams) => {
  const { id } = await params
  const user = await authenticate(req)

  const data = UpdateWorkflowStateRequestSchema.parse(await req.json())
  const workflowStatesService = new WorkflowStatesService(user)
  const updatedWorkflowState = await workflowStatesService.updateWorkflowState(id, data)

  return NextResponse.json({ updatedWorkflowState })
}
