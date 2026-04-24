'use client'

import { useDroppable } from '@dnd-kit/core'
import { ReactNode } from 'react'

interface TaskDropZoneProps {
  id: string
  children: ReactNode
  enabled?: boolean
  padding?: string
  rounded?: boolean
  preserveSpaceForHoverBorder?: boolean
}

export const TaskDropZone = ({
  id,
  children,
  enabled = true,
  padding = '0px',
  rounded = false,
  preserveSpaceForHoverBorder = false,
}: TaskDropZoneProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id,
    disabled: !enabled,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        border: preserveSpaceForHoverBorder && enabled ? '0.5px solid transparent' : 'none',
        borderRadius: rounded ? '4px' : '0px',
        backgroundColor: 'transparent',
        padding: enabled ? padding : '0px',
        ...(isOver &&
          enabled && {
            border: '0.5px solid #C9CBCD',
            backgroundColor: '#F8F9FB',
          }),
      }}
    >
      {children}
    </div>
  )
}
