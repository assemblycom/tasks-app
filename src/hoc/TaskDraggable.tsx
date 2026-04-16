'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSSProperties, ReactNode, useEffect, useRef } from 'react'

interface TaskDraggableProps {
  id: string
  children: ReactNode
  disabled?: boolean
  style?: CSSProperties
}

export const TaskDraggable = ({ id, children, disabled = false, style }: TaskDraggableProps) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    disabled,
  })
  const shouldSuppressClickRef = useRef(false)

  useEffect(() => {
    if (isDragging) {
      shouldSuppressClickRef.current = true
    }
  }, [isDragging])

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClickCapture={(event) => {
        if (!shouldSuppressClickRef.current) return
        event.preventDefault()
        event.stopPropagation()
        shouldSuppressClickRef.current = false
      }}
      style={{
        opacity: isDragging ? 0.5 : 1,
        touchAction: disabled ? 'auto' : 'manipulation',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
