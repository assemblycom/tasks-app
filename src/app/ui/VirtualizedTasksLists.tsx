'use client'

import { TaskCardList } from '@/app/detail/ui/TaskCardList'
import { TaskCard } from '@/components/cards/TaskCard'
import { CustomLink } from '@/hoc/CustomLink'
import { DragDropHandler } from '@/hoc/DragDropHandler'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { getCardHref } from '@/utils/getCardHref'
import { checkIfTaskViewer } from '@/utils/taskViewer'
import { UserRole } from '@api/core/types/user'
import { Box } from '@mui/material'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useMemo, useRef } from 'react'
import { useSelector } from 'react-redux'

import { TaskRow } from '@/components/cards/TaskRow'

import { PreviewMode } from '@/types/common'
import { sortTaskByDescendingOrder } from '@/utils/sortByDescending'

interface TasksVirtualizerProps {
  rows: TaskResponse[]
  mode: UserRole
  token: string | null
  subtasksByTaskId: Record<string, TaskResponse[]>
  workflowState?: WorkflowStateResponse
}

// virtualization component used in board view
export function TasksRowVirtualizer({ rows, mode, token, subtasksByTaskId, workflowState }: TasksVirtualizerProps) {
  const { showSubtasks } = useSelector(selectTaskBoard)
  const { tokenPayload } = useSelector(selectAuthDetails)
  const parentRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(
      (index: number) => {
        const task = rows[index]
        let estimate = 70
        if (task.isArchived) estimate += 24
        if (task.dueDate) estimate += 24
        if (task.title && task.title.length > 50) estimate += 20
        return estimate
      },
      [rows],
    ),
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 25,
  })

  return (
    <div
      ref={parentRef}
      className="List"
      style={{
        height: `100vh`,
        width: '100%',
        overflow: 'auto',
        columnGap: '6px',
      }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={(node) => {
              rowVirtualizer.measureElement(node)
            }}
            style={{
              display: 'flex',
              position: 'absolute',
              transform: `translateY(${virtualRow.start}px)`,
              width: '100%',
            }}
          >
            <div style={{ padding: '3px 0' }}>
              <CustomLink
                key={rows[virtualRow.index].id}
                href={{
                  pathname: getCardHref(rows[virtualRow.index], mode),
                  query: { token },
                }}
                style={{ width: 'fit-content' }}
                draggable={!checkIfTaskViewer(rows[virtualRow.index].associations, tokenPayload)}
              >
                <DragDropHandler
                  key={rows[virtualRow.index].id}
                  accept={'taskCard'}
                  index={virtualRow.index}
                  task={rows[virtualRow.index]}
                  draggable={!checkIfTaskViewer(rows[virtualRow.index].associations, tokenPayload)}
                >
                  <Box>
                    <TaskCard
                      task={rows[virtualRow.index]}
                      key={rows[virtualRow.index].id}
                      href={{
                        pathname: getCardHref(rows[virtualRow.index], mode),
                        query: { token },
                      }}
                      workflowState={workflowState}
                      mode={mode}
                      subtasks={showSubtasks ? (subtasksByTaskId[rows[virtualRow.index].id] ?? []) : []}
                      workflowDisabled={checkIfTaskViewer(rows[virtualRow.index].associations, tokenPayload)}
                    />
                  </Box>
                </DragDropHandler>
              </CustomLink>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
interface TasksListVirtualizerProps {
  workflowStates: WorkflowStateResponse[]
  mode: UserRole

  subtasksByTaskId: Record<string, TaskResponse[]>
  filterTaskWithWorkflowStateId: (id: string) => TaskResponse[]
  taskCountForWorkflowStateId: (id: string) => string
  previewMode?: PreviewMode
  onDropItem: (payload: { taskId: string; targetWorkflowStateId: string }) => void
}

type VirtualItem =
  | {
      type: 'task'
      task: TaskResponse
      workflowState: WorkflowStateResponse
      taskIndex: number
    }
  | {
      type: 'subtask'
      task: TaskResponse
      parentTask: TaskResponse
    }

export function TasksListVirtualizer({
  workflowStates,
  mode,
  subtasksByTaskId,
  filterTaskWithWorkflowStateId,
  taskCountForWorkflowStateId,
  previewMode,
  onDropItem,
}: TasksListVirtualizerProps) {
  const { showSubtasks } = useSelector(selectTaskBoard)
  const { tokenPayload } = useSelector(selectAuthDetails)

  const scrollRef = useRef<HTMLDivElement>(null)

  const sections = useMemo(() => {
    return workflowStates.map((workflowState) => {
      const tasks = sortTaskByDescendingOrder<TaskResponse>(filterTaskWithWorkflowStateId(workflowState.id))

      const items: VirtualItem[] = []
      tasks.forEach((task, taskIndex) => {
        items.push({
          type: 'task',
          task,
          workflowState,
          taskIndex,
        })

        if (showSubtasks) {
          const subtasks = subtasksByTaskId[task.id] ?? []
          subtasks.forEach((subtask) => {
            items.push({
              type: 'subtask',
              task: subtask,
              parentTask: task,
            })
          })
        }
      })

      return {
        workflowState,
        items,
      }
    })
  }, [workflowStates, filterTaskWithWorkflowStateId, showSubtasks, subtasksByTaskId])

  const allItems = useMemo(() => {
    return sections.flatMap((section) => section.items)
  }, [sections])

  const virtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 100,
  })

  const sectionRanges = useMemo(() => {
    let start = 0
    return sections.map((section) => {
      const end = start + section.items.length
      const range = { start, end }
      start = end
      return range
    })
  }, [sections])

  return (
    <div
      ref={scrollRef}
      style={{
        height: '100%',
        width: '100%',
        overflow: 'auto',
        contain: 'paint',
        willChange: 'transform',
      }}
    >
      {sections.map((section, sectionIndex) => {
        const range = sectionRanges[sectionIndex]
        const sectionItems = section.items

        return (
          <DragDropHandler
            key={section.workflowState.id}
            accept={'taskCard'}
            index={sectionIndex}
            id={section.workflowState.id}
            onDropItem={onDropItem}
            droppable
          >
            <TaskRow
              mode={mode}
              workflowStateId={section.workflowState.id}
              workflowStateType={section.workflowState.type}
              columnName={section.workflowState.name}
              taskCount={taskCountForWorkflowStateId(section.workflowState.id)}
              showAddBtn={mode === UserRole.IU || !!previewMode}
            >
              <div
                style={{
                  height: `${sectionItems.length * 44}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer
                  .getVirtualItems()
                  .filter((v) => v.index >= range.start && v.index < range.end)
                  .map((virtualRow) => {
                    const item = allItems[virtualRow.index]
                    const relativeIndex = virtualRow.index - range.start
                    const relativeStart = relativeIndex * 44

                    return (
                      <div
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${relativeStart}px)`,
                        }}
                      >
                        {item.type === 'task' && (
                          <div
                            style={{
                              padding: '3px 0',
                              width: '100%',
                            }}
                            draggable={!checkIfTaskViewer(item.task.associations, tokenPayload)}
                            onDragStart={(e) => {
                              if (checkIfTaskViewer(item.task.associations, tokenPayload)) {
                                e.preventDefault()
                              }
                            }}
                          >
                            <DragDropHandler
                              key={item.task.id}
                              accept={'taskCard'}
                              index={item.taskIndex}
                              task={item.task}
                              draggable={!checkIfTaskViewer(item.task.associations, tokenPayload)}
                            >
                              <TaskCardList task={item.task} variant="task" workflowState={item.workflowState} mode={mode} />
                            </DragDropHandler>
                          </div>
                        )}

                        {item.type === 'subtask' && (
                          <div style={{ padding: '3px 0', width: '100%' }}>
                            <TaskCardList
                              task={item.task}
                              variant="subtask"
                              mode={mode}
                              sx={{
                                padding: { xs: '10px 20px 10px 44px' },
                                height: '44px',
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            </TaskRow>
          </DragDropHandler>
        )
      })}
    </div>
  )
}
