export const fetchCache = 'force-no-store'

import { apiUrl } from '@/config'
import { ClientSideStateUpdate } from '@/hoc/ClientSideStateUpdate'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { PropsWithToken } from '@/types/interfaces'
import { PropsWithChildren } from 'react'

const getAllWorkflowStates = async (token: string): Promise<WorkflowStateResponse[]> => {
  const res = await fetch(`${apiUrl}/api/workflow-states?token=${token}`, {
    next: { tags: ['getAllWorkflowStates'] },
  })

  const data = await res.json()

  return data.workflowStates
}

export const WorkflowStateFetcher = async ({ token, children }: PropsWithToken & PropsWithChildren) => {
  const workflowStates = await getAllWorkflowStates(token)

  return <ClientSideStateUpdate workflowStates={workflowStates}>{children}</ClientSideStateUpdate>
}
