'use client'

import { TaskCardList } from '@/app/detail/ui/TaskCardList'
import { UserRole } from '@/app/api/core/types/user'
import { TaskCard } from '@/components/cards/TaskCard'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { View } from '@/types/interfaces'
import { getCardHref } from '@/utils/getCardHref'
import { checkIfTaskViewer } from '@/utils/taskViewer'
import { Box } from '@mui/material'
import { FC } from 'react'
import { useSelector } from 'react-redux'

interface TaskDragOverlayCardProps {
  task: TaskResponse
  viewMode: View
  mode: UserRole
  token: string
}

export const TaskDragOverlayCard: FC<TaskDragOverlayCardProps> = ({ task, viewMode, mode, token }) => {
  const { tokenPayload } = useSelector(selectAuthDetails)

  if (viewMode === View.BOARD_VIEW) {
    return (
      <Box sx={{ width: '336px', opacity: 0.95 }}>
        <TaskCard
          mode={mode}
          task={task}
          href={{ pathname: getCardHref(task, mode), query: { token } }}
          workflowDisabled={checkIfTaskViewer(task.associations, tokenPayload)}
        />
      </Box>
    )
  }

  return (
    <Box sx={{ width: '720px', opacity: 0.95 }}>
      <TaskCardList task={task} variant="task" mode={mode} disableNavigation />
    </Box>
  )
}
