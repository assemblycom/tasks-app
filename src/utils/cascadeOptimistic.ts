import { bulkUpdateWorkflowStateIdByTaskIds } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { StateType } from '@prisma/client'

export const getOpenSubtaskIds = (
  parentTaskId: string,
  accessibleTasks: TaskResponse[],
  workflowStates: WorkflowStateResponse[],
): string[] =>
  accessibleTasks
    .filter((t) => {
      if (t.parentId !== parentTaskId) return false
      const state = workflowStates.find((s) => s.id === t.workflowStateId)
      return state?.type !== StateType.completed
    })
    .map((t) => t.id)

export const optimisticallyCascadeSubtasks = (
  parentTaskId: string,
  targetWorkflowStateId: string,
  accessibleTasks: TaskResponse[],
  workflowStates: WorkflowStateResponse[],
) => {
  const openSubtaskIds = getOpenSubtaskIds(parentTaskId, accessibleTasks, workflowStates)
  if (openSubtaskIds.length === 0) return
  store.dispatch(bulkUpdateWorkflowStateIdByTaskIds({ taskIds: openSubtaskIds, targetWorkflowStateId }))
}
