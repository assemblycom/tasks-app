import { NextRequest, NextResponse } from 'next/server'
import WorkflowStatesService from '@api/workflow-states/workflowStates.service'
import { CreateWorkflowStateRequestSchema } from '@/types/dto/workflowStates.dto'
import httpWorkflowState from 'http-status'
import authenticate from '@api/core/utils/authenticate'

export const getWorkflowStates = async (req: NextRequest) => {
  const user = await authenticate(req)

  const workflowStatesService = new WorkflowStatesService(user)
  const workflowStates = await workflowStatesService.getAllWorkflowStates()

  return NextResponse.json({ workflowStates })
}

export const createWorkflowStates = async (req: NextRequest) => {
  const user = await authenticate(req)

  const data = CreateWorkflowStateRequestSchema.parse(await req.json())
  const workflowStatesService = new WorkflowStatesService(user)
  const newWorkflowState = await workflowStatesService.createWorkflowStates(data)

  return NextResponse.json({ newWorkflowState }, { status: httpWorkflowState.CREATED })
}
