'use client'

import { updateTask } from '@/app/(home)/actions'
import { TaskDataFetcher } from '@/app/_fetchers/TaskDataFetcher'
import { clientUpdateTask } from '@/app/detail/[task_id]/[user_type]/actions'
import { TaskBoardAppBridge } from '@/app/ui/TaskBoardAppBridge'
import { TasksRowVirtualizer, TasksListVirtualizer } from '@/app/ui/VirtualizedTasksLists'
import { TaskColumn } from '@/components/cards/TaskColumn'
import { CompletionCascadeModal } from '@/components/layouts/CompletionCascadeModal'
import DashboardEmptyState from '@/components/layouts/EmptyState/DashboardEmptyState'
import { FilterBar } from '@/components/layouts/FilterBar'
import { SecondaryFilterBar } from '@/components/layouts/SecondaryFilterBar'
import { DroppableArea } from '@/hoc/dndKit/DroppableArea'
import { TaskDndContext } from '@/hoc/dndKit/TaskDndContext'
import { TaskDragPreview } from '@/hoc/dndKit/TaskDragPreview'
import { useFilter } from '@/hooks/useFilter'
import { selectTaskBoard, updateWorkflowStateIdByTaskId } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { WorkspaceResponse } from '@/types/common'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { View } from '@/types/interfaces'
import { requireLiveToken } from '@/utils/assemblyTokenStore'
import { getOpenSubtaskIds, optimisticallyCascadeSubtasks } from '@/utils/cascadeOptimistic'
import { sortTaskByDescendingOrder } from '@/utils/sortByDescending'
import { prioritizeStartedStates } from '@/utils/workflowStates'
import { UserRole } from '@api/core/types/user'
import { Box, Stack } from '@mui/material'
import { StateType } from '@prisma/client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { z } from 'zod'

interface TaskBoardProps {
  mode: UserRole
  workspace?: WorkspaceResponse
  token: string
}

export const TaskBoard = ({ mode, workspace, token }: TaskBoardProps) => {
  const {
    workflowStates,
    tasks,
    filteredTasks,
    view,
    viewSettingsTemp,
    filterOptions,
    isTasksLoading,
    previewMode,
    accessibleTasks,
    showSubtasks,
    showArchived,
    showUnarchived,
  } = useSelector(selectTaskBoard)
  const boardRef = useRef<HTMLDivElement>(null)

  const [pendingDrop, setPendingDrop] = useState<{
    taskId: string
    targetState: WorkflowStateResponse
    subtaskCount: number
  } | null>(null)

  const performDropUpdate = useCallback(
    (taskId: string, targetWorkflowStateId: string, skipSubtaskCascade: boolean = false) => {
      store.dispatch(updateWorkflowStateIdByTaskId({ taskId, targetWorkflowStateId }))
      const liveToken = requireLiveToken()
      if (mode === UserRole.Client && !previewMode) {
        clientUpdateTask(liveToken, taskId, targetWorkflowStateId, skipSubtaskCascade)
      } else {
        updateTask({
          token: liveToken,
          taskId,
          payload: { workflowStateId: targetWorkflowStateId, skipSubtaskCascade },
        })
      }
    },
    [token, mode, previewMode],
  )

  const onDropItem = useCallback(
    (payload: { taskId: string; targetWorkflowStateId: string }) => {
      const { taskId, targetWorkflowStateId } = payload
      const task = accessibleTasks.find((t) => t.id === taskId)
      const targetState = workflowStates.find((s) => s.id === targetWorkflowStateId)
      const sourceState = workflowStates.find((s) => s.id === task?.workflowStateId)
      const movingToCompleted = targetState?.type === StateType.completed && sourceState?.type !== StateType.completed
      const openSubtaskCount = getOpenSubtaskIds(taskId, accessibleTasks, workflowStates).length
      if (movingToCompleted && openSubtaskCount > 0 && targetState) {
        setPendingDrop({ taskId, targetState, subtaskCount: openSubtaskCount })
        return
      }
      performDropUpdate(taskId, targetWorkflowStateId)
    },
    [token, accessibleTasks, workflowStates, performDropUpdate],
  )
  const filterTaskWithWorkflowStateId = (workflowStateId: string): TaskResponse[] => {
    return filteredTasks.filter((task) => task.workflowStateId === workflowStateId)
  }

  const taskCountForWorkflowStateId = (workflowStateId: string): string => {
    const taskCount = tasks.filter((task) => task.workflowStateId === workflowStateId).length
    const filteredTaskCount = filteredTasks.filter((task) => task.workflowStateId === workflowStateId).length
    const isFilterOn = Object.values(filterOptions).some((value) => !!value)
    if (!isFilterOn) {
      return taskCount.toString()
    }
    return filteredTaskCount.toString()
  }

  const viewBoardSettings = viewSettingsTemp ? viewSettingsTemp.viewMode : view
  const archivedOptions = {
    showArchived: viewSettingsTemp ? viewSettingsTemp.showArchived : showArchived,
    showUnarchived: viewSettingsTemp ? viewSettingsTemp.showUnarchived : showUnarchived,
  }

  useFilter(viewSettingsTemp ? viewSettingsTemp.filterOptions : filterOptions, !!previewMode)
  const userHasNoFilter =
    filterOptions &&
    !filterOptions.type &&
    !filterOptions.keyword &&
    archivedOptions.showUnarchived &&
    !archivedOptions.showArchived

  const [hasInitialized, setHasInitialized] = useState(false)
  useEffect(() => {
    if (!isTasksLoading && !hasInitialized) {
      setHasInitialized(true)
    }
  }, [isTasksLoading])

  const subtasksByTaskId = useMemo(() => {
    if (!showSubtasks) return {}
    const grouped: Record<string, TaskResponse[]> = {}

    accessibleTasks.forEach((item) => {
      if (!item.parentId) return
      if (item.isArchived && !showArchived) return
      if (!item.isArchived && !showUnarchived) return
      if (!grouped[item.parentId]) grouped[item.parentId] = []
      grouped[item.parentId].push(item)
    })

    Object.keys(grouped).forEach((id) => {
      grouped[id] = sortTaskByDescendingOrder<TaskResponse>(grouped[id])
    })

    return grouped
  }, [accessibleTasks, showSubtasks, showArchived, showUnarchived])

  if (!hasInitialized) {
    return <TaskDataFetcher token={token} />
  } //fix this logic as soon as copilot API natively supports access scopes by creating an endpoint which shows the count of filteredTask and total tasks.

  if (tasks && !tasks.length && userHasNoFilter && mode === UserRole.Client && !previewMode && !isTasksLoading) {
    return (
      <>
        <TaskDataFetcher token={token ?? ''} />
        <DashboardEmptyState userType={mode} />
      </>
    )
  }

  return (
    <>
      <TaskDataFetcher token={token} />

      {mode == UserRole.IU && <TaskBoardAppBridge token={token} role={UserRole.IU} portalUrl={workspace?.portalUrl} />}

      {/* Filterbars */}
      <FilterBar mode={mode} />
      {mode == UserRole.IU && <SecondaryFilterBar mode={mode} />}

      {/* Task board according to selected view */}
      <TaskDndContext
        onDropItem={onDropItem}
        renderOverlay={(task) => <TaskDragPreview task={task} mode={mode} />}
        autoScroll={
          viewBoardSettings === View.LIST_VIEW
            ? { threshold: { x: 0, y: 0.18 }, acceleration: 10, layoutShiftCompensation: false }
            : { threshold: { x: 0.1, y: 0.18 }, acceleration: 10, layoutShiftCompensation: false }
        }
      >
        {viewBoardSettings === View.BOARD_VIEW && (
          <Box sx={{ padding: '12px 12px', height: `calc(100vh - 130px)` }}>
            <Stack
              columnGap={2}
              sx={{
                flexDirection: 'row',
                overflowX: 'auto',
              }}
            >
              {workflowStates.map((list) => (
                <DroppableArea
                  key={list.id}
                  workflowStateId={list.id}
                  style={{
                    padding: '8px 12px',
                    border: '0.5px solid transparent',
                    borderRadius: '4px',
                  }}
                  isOverStyle={{
                    border: '0.5px solid #C9CBCD',
                    backgroundColor: '#F8F9FB',
                  }}
                >
                  <TaskColumn
                    key={list.id}
                    mode={mode}
                    workflowStateId={list.id}
                    columnName={list.name}
                    taskCount={taskCountForWorkflowStateId(list.id)}
                    showAddBtn={mode === UserRole.IU || !!previewMode}
                  >
                    <TasksRowVirtualizer
                      rows={sortTaskByDescendingOrder<TaskResponse>(filterTaskWithWorkflowStateId(list.id))}
                      mode={mode}
                      token={token}
                      subtasksByTaskId={subtasksByTaskId}
                      workflowState={list}
                    />
                  </TaskColumn>
                </DroppableArea>
              ))}
            </Stack>
          </Box>
        )}
        {viewBoardSettings === View.LIST_VIEW && (
          <Stack
            sx={{
              flexDirection: 'column',
              height: `calc(100vh - 130px)`,
              width: '99.92%',
              margin: '0 auto',
            }}
          >
            <TasksListVirtualizer
              workflowStates={prioritizeStartedStates(workflowStates)}
              mode={mode}
              subtasksByTaskId={subtasksByTaskId}
              filterTaskWithWorkflowStateId={filterTaskWithWorkflowStateId}
              taskCountForWorkflowStateId={taskCountForWorkflowStateId}
              previewMode={previewMode}
            />
          </Stack>
        )}
      </TaskDndContext>

      <CompletionCascadeModal
        targetState={pendingDrop?.targetState ?? null}
        subtaskCount={pendingDrop?.subtaskCount ?? 0}
        onUpdate={() => {
          if (pendingDrop) {
            optimisticallyCascadeSubtasks(pendingDrop.taskId, pendingDrop.targetState.id, accessibleTasks, workflowStates)
            performDropUpdate(pendingDrop.taskId, pendingDrop.targetState.id, false)
          }
          setPendingDrop(null)
        }}
        onSkip={() => {
          if (pendingDrop) performDropUpdate(pendingDrop.taskId, pendingDrop.targetState.id, true)
          setPendingDrop(null)
        }}
        onClose={() => setPendingDrop(null)}
      />
    </>
  )
}
