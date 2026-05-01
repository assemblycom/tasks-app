'use client'

import { TaskResponse } from '@/types/dto/tasks.dto'
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { AutoScrollOptions } from '@dnd-kit/core'
import { ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react'

interface Props {
  children: ReactNode
  onDropItem: (payload: { taskId: string; targetWorkflowStateId: string }) => void
  renderOverlay: (task: TaskResponse) => ReactNode
  autoScroll?: boolean | AutoScrollOptions
}

export const ACTIVE_DRAG_DATA_KEY = 'task'

// Lightweight drag-state context. dnd-kit's own useDndContext re-renders on every
// pointer move (over/collisions/etc update continuously); this only flips on
// drag start/end, so consumers can react to "is a drag in progress" without
// thrashing during the drag itself.
const TaskDragStateContext = createContext<{ isDragging: boolean }>({ isDragging: false })
export const useTaskDragState = () => useContext(TaskDragStateContext)

export function TaskDndContext({ children, onDropItem, renderOverlay, autoScroll = true }: Props) {
  const [activeTask, setActiveTask] = useState<TaskResponse | null>(null)
  const dragStateValue = useMemo(() => ({ isDragging: !!activeTask }), [activeTask])

  // Activation distance prevents accidental drags on click. Touch uses a short delay
  // so taps still register normally while a press-and-drag activates a real drag.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = event.active.data.current?.[ACTIVE_DRAG_DATA_KEY] as TaskResponse | undefined
    if (task) setActiveTask(task)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveTask(null)
      if (!over) return
      const task = active.data.current?.[ACTIVE_DRAG_DATA_KEY] as TaskResponse | undefined
      const targetWorkflowStateId = over.data.current?.workflowStateId as string | undefined
      if (!task || !targetWorkflowStateId) return
      if (task.workflowStateId === targetWorkflowStateId) return
      onDropItem({ taskId: task.id, targetWorkflowStateId })
    },
    [onDropItem],
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveTask(null)}
      autoScroll={autoScroll}
    >
      <TaskDragStateContext.Provider value={dragStateValue}>{children}</TaskDragStateContext.Provider>
      {activeTask && <style>{`*, *::before, *::after { cursor: default !important; }`}</style>}
      <TaskDragOverlayPortal activeTask={activeTask} renderOverlay={renderOverlay} />
    </DndContext>
  )
}

// Split out so we can lazy-import DragOverlay without breaking SSR.
import { DragOverlay } from '@dnd-kit/core'
import { snapCenterToCursor } from '@dnd-kit/modifiers'

function TaskDragOverlayPortal({
  activeTask,
  renderOverlay,
}: {
  activeTask: TaskResponse | null
  renderOverlay: (task: TaskResponse) => ReactNode
}) {
  return (
    <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]} style={{ width: 'auto', height: 'auto' }}>
      {activeTask ? (
        <div
          style={{
            display: 'inline-block',
            boxShadow: '0 6px 16px rgba(15, 23, 42, 0.12)',
            borderRadius: 6,
          }}
        >
          {renderOverlay(activeTask)}
        </div>
      ) : null}
    </DragOverlay>
  )
}
