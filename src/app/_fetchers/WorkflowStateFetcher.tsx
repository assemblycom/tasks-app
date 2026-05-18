export const fetchCache = 'force-no-store'

import { apiUrl } from '@/config'
import { fetchWithErrorHandler } from '@/app/_fetchers/fetchWithErrorHandler'
import { ClientSideStateUpdate } from '@/hoc/ClientSideStateUpdate'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { PropsWithToken } from '@/types/interfaces'
import { PropsWithChildren } from 'react'

interface WorkflowStateFetcherProps extends PropsWithToken, PropsWithChildren {
  task?: TaskResponse
}

const getAllWorkflowStates = async (token: string): Promise<WorkflowStateResponse[]> => {
  const data = await fetchWithErrorHandler<{ workflowStates: WorkflowStateResponse[] }>(
    `${apiUrl}/api/workflow-states?token=${token}`,
    {
      next: { tags: ['getAllWorkflowStates'] },
    },
  )

  return data.workflowStates
}

export const WorkflowStateFetcher = async ({ token, children, task }: WorkflowStateFetcherProps) => {
  const workflowStates = await getAllWorkflowStates(token)

  return (
    <ClientSideStateUpdate workflowStates={workflowStates} task={task}>
      {children}
    </ClientSideStateUpdate>
  )
}
