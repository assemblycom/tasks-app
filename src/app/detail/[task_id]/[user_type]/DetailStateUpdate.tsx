import { getAllTasks, getAllWorkflowStates } from '@/app/(home)/page'
import { ClientSideStateUpdate } from '@/hoc/ClientSideStateUpdate'
import { SeedActiveTask } from '@/hoc/state-seeders'
import { Token } from '@/types/common'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { CreateViewSettingsDTO } from '@/types/dto/viewSettings.dto'

interface DetailStateUpdateProps {
  isRedirect?: boolean
  token: string
  tokenPayload: Token | null
  task: TaskResponse
  children: React.ReactNode
  viewSettings: CreateViewSettingsDTO
}

export const DetailStateUpdate = async ({
  isRedirect,
  token,
  tokenPayload,
  task,
  viewSettings,
  children,
}: DetailStateUpdateProps) => {
  if (!isRedirect) {
    return (
      <ClientSideStateUpdate token={token} tokenPayload={tokenPayload} viewSettings={viewSettings}>
        <SeedActiveTask task={task} />
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
    >
      <SeedActiveTask task={task} />
      {children}
    </ClientSideStateUpdate>
  )
}
