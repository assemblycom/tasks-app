import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { getOpenSubtaskIds } from '@/utils/cascadeOptimistic'
import { useMemo } from 'react'
import { useSelector } from 'react-redux'

export const useSubtaskCount = (taskId: string) => {
  const { accessibleTasks } = useSelector(selectTaskBoard)
  return useMemo(() => accessibleTasks.filter((t) => t.parentId === taskId).length, [accessibleTasks, taskId])
}

export const useOpenSubtaskCount = (taskId: string) => {
  const { accessibleTasks, workflowStates } = useSelector(selectTaskBoard)
  return useMemo(
    () => getOpenSubtaskIds(taskId, accessibleTasks, workflowStates).length,
    [accessibleTasks, workflowStates, taskId],
  )
}
