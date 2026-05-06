'use client'

import { UserRole } from '@/app/api/core/types/user'
import { TaskCard } from '@/components/cards/TaskCard'
import { ArchiveBoxIcon } from '@/icons'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { View } from '@/types/interfaces'
import { getCardHref } from '@/utils/getCardHref'
import { Box, Stack, Typography } from '@mui/material'
import { useSelector } from 'react-redux'

interface Props {
  task: TaskResponse
  mode: UserRole
}

export function TaskDragPreview({ task, mode }: Props) {
  const { view, token, workflowStates } = useSelector(selectTaskBoard)
  const workflowState = workflowStates.find((s) => s.id === task.workflowStateId)

  if (view === View.BOARD_VIEW) {
    return (
      <Box sx={{ width: '336px' }}>
        <TaskCard
          mode={mode}
          task={task}
          href={{ pathname: getCardHref(task, mode), query: { token } }}
          workflowState={workflowState}
        />
      </Box>
    )
  }

  return (
    <Stack
      direction="row"
      alignItems="flex-start"
      columnGap="16px"
      sx={{
        bgcolor: '#fff',
        border: '1px solid #EFF1F4',
        padding: '12px 20px',
        width: '240px',
        borderRadius: '4px',
      }}
    >
      <Typography
        variant="sm"
        fontWeight={400}
        sx={{
          color: (theme) => theme.color.gray[500],
          flexGrow: 0,
          flexShrink: 0,
          minWidth: '75px',
          lineHeight: '21px',
        }}
      >
        {task.label}
      </Typography>
      <Box sx={{ display: 'flex', gap: '8px', flex: 1, minWidth: 0 }}>
        <Typography variant="sm" sx={{ lineHeight: '21px', wordBreak: 'break-word', flexGrow: 1 }}>
          {task.title}
        </Typography>
        {task.isArchived && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', paddingTop: '2px' }}>
            <ArchiveBoxIcon />
          </Box>
        )}
      </Box>
    </Stack>
  )
}
