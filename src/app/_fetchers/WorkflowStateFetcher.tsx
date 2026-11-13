import { loadWorkflowStates } from '@/app/_fetchers/loaders'
import { ClientSideStateUpdate } from '@/hoc/ClientSideStateUpdate'
import User from '@api/core/models/User.model'
import { PropsWithChildren } from 'react'

export const WorkflowStateFetcher = async ({ user, children }: PropsWithChildren & { user: User }) => {
  const workflowStates = await loadWorkflowStates(user)

  return <ClientSideStateUpdate workflowStates={workflowStates}>{children}</ClientSideStateUpdate>
}
