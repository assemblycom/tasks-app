'use client'

import { handleCreate } from '@/app/(home)/actions'
import { UserRole } from '@/app/api/core/types/user'
import { NewTaskCard } from '@/app/detail/ui/NewTaskCard'
import { TaskCardList } from '@/app/detail/ui/TaskCardList'
import { AddBtn } from '@/components/buttons/AddBtn'
import { GhostBtn } from '@/components/buttons/GhostBtn'
import { useDebounce } from '@/hooks/useDebounce'
import { GrayAddMediumIcon } from '@/icons'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { selectTaskDetails } from '@/redux/features/taskDetailsSlice'
import { CreateTaskRequest, TaskResponse } from '@/types/dto/tasks.dto'
import { fetcher } from '@/utils/fetcher'
import { generateRandomString } from '@/utils/generateRandomString'
import { checkOptimisticStableId } from '@/utils/optimisticCommentUtils'
import { getTempTask } from '@/utils/optimisticTaskUtils'
import { sortSubtasksByPriority } from '@/utils/sortByDescending'
import { Box, Stack, Typography } from '@mui/material'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import useSWR, { useSWRConfig } from 'swr'

interface OptimisticUpdate {
  tempId: string
  serverId?: string
  timestamp: number
}

export const Subtasks = ({
  task_id,
  token,
  canCreateSubtasks,
}: {
  task_id: string
  token: string
  userType: UserRole
  canCreateSubtasks: boolean
}) => {
  const [openTaskForm, setOpenTaskForm] = useState(false)
  const { workflowStates, assignee, activeTask, showArchived, showUnarchived } = useSelector(selectTaskBoard)
  const { tokenPayload } = useSelector(selectAuthDetails)
  const { fromNotificationCenter } = useSelector(selectTaskDetails)
  const [optimisticUpdates, setOptimisticUpdates] = useState<OptimisticUpdate[]>([]) //might need this server-temp id maps in the future.
  const [lastUpdated, setLastUpdated] = useState<string | null>()
  const handleFormCancel = () => setOpenTaskForm(false)
  const handleFormOpen = () => setOpenTaskForm(!openTaskForm)

  const mode = tokenPayload?.companyId ? UserRole.Client : UserRole.IU

  // Default archived flag matches the API default (false) so we don't include archived subtasks before view settings hydrate.
  const archivedParam = showArchived ?? false
  const unarchivedParam = showUnarchived ?? true
  const cacheKey = `/api/tasks/?token=${token}&showArchived=${archivedParam ? 1 : 0}&showUnarchived=${unarchivedParam ? 1 : 0}&parentId=${task_id}`

  const { data: subTasks } = useSWR(cacheKey, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  })
  const sortedSubtasks = useMemo<TaskResponse[]>(
    () => (subTasks?.tasks ? sortSubtasksByPriority<TaskResponse>(subTasks.tasks) : []),
    [subTasks?.tasks],
  )
  const didMount = useRef(false)
  const shouldRefetchRef = useRef(true) //preventing double fetching from subtask update apis. Due to optimistic update revalidation, we are already fetching logs there. So no need to refetch in case for subtask update.

  const { mutate } = useSWRConfig()

  const _debounceMutate = async (cacheKey: string) => await mutate(cacheKey)
  const debounceMutate = useDebounce(_debounceMutate, 200)

  useEffect(() => {
    if (!activeTask) return
    if (!didMount.current || !shouldRefetchRef.current) {
      didMount.current = true
      shouldRefetchRef.current = true
      setLastUpdated(activeTask?.lastSubtaskUpdated)
      return //skip the refetch on first mount and shouldRefetch is false.
    }
    if (activeTask?.lastSubtaskUpdated && activeTask?.lastSubtaskUpdated !== lastUpdated) {
      debounceMutate(cacheKey)
    }
    setLastUpdated(activeTask?.lastSubtaskUpdated)
  }, [activeTask?.lastSubtaskUpdated])

  const handleSubTaskCreation = (payload: CreateTaskRequest) => {
    const tempId = generateRandomString('temp-task')
    setOptimisticUpdates((prev) => [
      ...prev,
      {
        tempId,
        timestamp: Date.now(),
      },
    ])
    const tempSubtask: TaskResponse = getTempTask(
      tempId,
      payload,
      workflowStates,
      assignee,
      tokenPayload?.workspaceId ?? '',
      tokenPayload?.internalUserId ?? '',
      task_id,
    )
    const optimisticData = subTasks?.tasks ? sortSubtasksByPriority([...subTasks.tasks, tempSubtask]) : [tempSubtask]
    try {
      mutate(
        cacheKey,
        async () => {
          const subTask = await handleCreate(token, payload, { disableSubtaskTemplates: true })
          if (!subTask || 'error' in subTask) {
            throw new Error(subTask?.error ?? 'Failed to create subtask')
          }
          setOptimisticUpdates((prev) =>
            prev.map((update) => (update.tempId === tempId ? { ...update, serverId: subTask.id } : update)),
          )
          return await fetcher(cacheKey)
        },
        {
          optimisticData: { tasks: optimisticData },
          rollbackOnError: true,
          revalidate: true,
        },
      )
    } catch (error) {
      console.error('Failed to create subtask:', error)
      setOptimisticUpdates((prev) => prev.filter((update) => update.tempId !== tempId))
    }
  }

  const handleSubTaskUpdate = async (taskId: string, changes: Partial<TaskResponse>, updater: () => Promise<void>) => {
    if (!subTasks?.tasks) return
    const updatedTasks = subTasks.tasks.map((task: TaskResponse) => (task.id === taskId ? { ...task, ...changes } : task))

    try {
      await mutate(
        cacheKey,
        async () => {
          shouldRefetchRef.current = false
          await updater()
          return await fetcher(cacheKey)
        },
        {
          optimisticData: { tasks: updatedTasks },
          rollbackOnError: true,
          revalidate: false,
        },
      )
    } catch (error) {
      console.error('Failed to update subtask:', error)
    }
  }

  return (
    <Stack
      direction="column"
      rowGap={'8px'}
      width="100%"
      sx={{ padding: !canCreateSubtasks && subTasks?.tasks?.length == 0 ? '0px' : '24px 0px 0px' }}
    >
      {canCreateSubtasks && (
        <>
          {subTasks && sortedSubtasks.length > 0 ? (
            <Stack
              direction="row"
              sx={{
                display: 'flex',
                height: '32px',
                justifyContent: 'space-between',
                alignItems: 'center',
                alignSelf: 'stretch',
              }}
            >
              <Typography variant="lg">Subtasks</Typography>

              <AddBtn handleClick={handleFormOpen} />
            </Stack>
          ) : subTasks ? (
            // If subtasks has been loaded but task length is empty, show button
            <GhostBtn buttonText="Create subtask" handleClick={handleFormOpen} startIcon={<GrayAddMediumIcon />} />
          ) : (
            // If subtasks list hasn't been rendered
            <></>
          )}
        </>
      )}
      {!canCreateSubtasks && sortedSubtasks.length > 0 && (
        <Stack
          direction="row"
          sx={{
            display: 'flex',
            height: '32px',
            justifyContent: 'space-between',
            alignItems: 'center',
            alignSelf: 'stretch',
          }}
        >
          <Typography variant="lg">Subtasks</Typography>
        </Stack>
      )}

      {openTaskForm && <NewTaskCard handleClose={handleFormCancel} handleSubTaskCreation={handleSubTaskCreation} />}
      <Box>
        {sortedSubtasks.map((item: TaskResponse) => {
          const isTempId = item.id.includes('temp')

          return (
            <TaskCardList
              isTemp={isTempId}
              key={checkOptimisticStableId(item, optimisticUpdates)}
              task={item}
              variant="subtask"
              mode={mode}
              handleUpdate={handleSubTaskUpdate}
              disableNavigation={fromNotificationCenter}
            />
          )
        })}
      </Box>
    </Stack>
  )
}
