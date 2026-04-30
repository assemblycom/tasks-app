'use client'

import { TaskResponse } from '@/types/dto/tasks.dto'
import { useDraggable } from '@dnd-kit/core'
import { CSSProperties, ReactNode } from 'react'
import { ACTIVE_DRAG_DATA_KEY } from './TaskDndContext'

interface Props {
  task: TaskResponse
  disabled?: boolean
  children: ReactNode
  style?: CSSProperties
}

export function DraggableTask({ task, disabled, children, style }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { [ACTIVE_DRAG_DATA_KEY]: task },
    disabled,
  })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        ...style,
        opacity: isDragging ? 0.35 : 1,
        cursor: disabled ? undefined : 'grab',
        touchAction: 'manipulation',
        outline: 'none',
      }}
    >
      {children}
    </div>
  )
}
