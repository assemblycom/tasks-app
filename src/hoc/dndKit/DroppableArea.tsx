'use client'

import { TaskResponse } from '@/types/dto/tasks.dto'
import { useDroppable } from '@dnd-kit/core'
import { CSSProperties, ReactNode } from 'react'
import { ACTIVE_DRAG_DATA_KEY } from './TaskDndContext'

interface Props {
  workflowStateId: string
  children: ReactNode
  style?: CSSProperties
  isOverStyle?: CSSProperties
  className?: string
}

export function DroppableArea({ workflowStateId, children, style, isOverStyle, className }: Props) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `column-${workflowStateId}`,
    data: { workflowStateId },
  })

  const activeTask = active?.data.current?.[ACTIVE_DRAG_DATA_KEY] as TaskResponse | undefined
  const isActiveDifferentColumn = isOver && activeTask && activeTask.workflowStateId !== workflowStateId

  return (
    <div
      ref={setNodeRef}
      className={className}
      style={{
        ...style,
        ...(isActiveDifferentColumn ? isOverStyle : undefined),
        transition: 'background-color 120ms ease, border-color 120ms ease',
      }}
    >
      {children}
    </div>
  )
}
