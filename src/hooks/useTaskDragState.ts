'use client'

import { DragEndEvent, DragStartEvent, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { useCallback, useMemo, useState } from 'react'

const TASK_DRAGGABLE_PREFIX = 'task-card-'
const WORKFLOW_DROPPABLE_PREFIX = 'workflow-state-'

const toTaskDraggableId = (taskId: string) => `${TASK_DRAGGABLE_PREFIX}${taskId}`
const toWorkflowDroppableId = (workflowStateId: string) => `${WORKFLOW_DROPPABLE_PREFIX}${workflowStateId}`

const parsePrefixedId = (value: unknown, prefix: string): string | null => {
  if (typeof value !== 'string') return null
  if (!value.startsWith(prefix)) return null
  return value.slice(prefix.length)
}

interface UseTaskDragStateProps {
  tasks: TaskResponse[]
  onDropItem: (payload: { taskId: string; targetWorkflowStateId: string }) => void
}

export const useTaskDragState = ({ tasks, onDropItem }: UseTaskDragStateProps) => {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 120,
        tolerance: 5,
      },
    }),
  )

  const tasksById = useMemo(() => {
    return new Map(tasks.map((task) => [task.id, task]))
  }, [tasks])

  const activeTask = useMemo(() => {
    if (!activeTaskId) return null
    return tasksById.get(activeTaskId) ?? null
  }, [activeTaskId, tasksById])

  const onDragStart = useCallback((event: DragStartEvent) => {
    const taskId = parsePrefixedId(event.active.id, TASK_DRAGGABLE_PREFIX)
    setActiveTaskId(taskId)
  }, [])

  const onDragCancel = useCallback(() => {
    setActiveTaskId(null)
  }, [])

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const taskId = parsePrefixedId(event.active.id, TASK_DRAGGABLE_PREFIX)
      const targetWorkflowStateId = parsePrefixedId(event.over?.id, WORKFLOW_DROPPABLE_PREFIX)
      setActiveTaskId(null)

      if (!taskId || !targetWorkflowStateId) return
      const draggedTask = tasksById.get(taskId)
      if (!draggedTask) return
      if (draggedTask.workflowStateId === targetWorkflowStateId) return

      onDropItem({ taskId, targetWorkflowStateId })
    },
    [onDropItem, tasksById],
  )

  return {
    sensors,
    activeTask,
    onDragStart,
    onDragEnd,
    onDragCancel,
    toTaskDraggableId,
    toWorkflowDroppableId,
  }
}
