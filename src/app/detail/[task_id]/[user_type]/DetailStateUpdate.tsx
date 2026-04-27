import { ClientSideStateUpdate } from '@/hoc/ClientSideStateUpdate'
import { getAllTasks, getAllWorkflowStates } from '@/app/(home)/page'
import { Token, WorkspaceResponse } from '@/types/common'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { CreateViewSettingsDTO } from '@/types/dto/viewSettings.dto'

interface DetailStateUpdateProps {
  isRedirect?: boolean
  token: string
  tokenPayload: Token | null
  task: TaskResponse
  children: React.ReactNode
  workspace?: WorkspaceResponse
  viewSettings: CreateViewSettingsDTO
}

export const DetailStateUpdate = async ({
  isRedirect,
  token,
  tokenPayload,
  task,
  workspace,
  viewSettings,
  children,
}: DetailStateUpdateProps) => {
  if (!isRedirect) {
    return (
      <ClientSideStateUpdate
        token={token}
        tokenPayload={tokenPayload}
        task={task}
        workspace={workspace}
        viewSettings={viewSettings}
      >
        {children}
      </ClientSideStateUpdate>
    )
  }

  // If flow has been redirected from notifications CTA button directly,
  // we must first get context for tasks and workflowStates
  const [workflowStates, tasks] = await Promise.all([getAllWorkflowStates(token), getAllTasks(token)])
  return (
    <ClientSideStateUpdate
      workflowStates={workflowStates}
      tasks={tasks}
      token={token}
      viewSettings={viewSettings}
      tokenPayload={tokenPayload}
      task={task}
      workspace={workspace}
    >
      {children}
    </ClientSideStateUpdate>
  )
}
