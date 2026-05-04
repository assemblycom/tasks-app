'use client'

import { ArchiveBtn } from '@/components/buttons/ArchiveBtn'
import { cache, useEffect, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { fetcher } from '@/utils/fetcher'
import { useSelector } from 'react-redux'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { Skeleton } from '@mui/material'
import store from '@/redux/store'
import { selectTaskDetails, setTask } from '@/redux/features/taskDetailsSlice'
import { UserType } from '@/types/interfaces'
import { requireLiveToken } from '@/utils/assemblyTokenStore'
import { DetailAppBridge } from './DetailAppBridge'

export const ArchiveWrapper = ({ taskId, userType }: { taskId: string; userType: UserType }) => {
  const { activeTask, previewMode } = useSelector(selectTaskBoard)
  const { task } = useSelector(selectTaskDetails)
  const { mutate } = useSWRConfig()
  // Stable cache key — fetcher injects the live token at request time.
  const cacheKey = `/api/tasks/${taskId}`
  const [isArchived, setIsArchived] = useState<boolean | undefined>(undefined)

  // Set the initial state when `data` becomes available
  useEffect(() => {
    const currentTask = activeTask
    if (currentTask) {
      setIsArchived(currentTask.isArchived)
      store.dispatch(setTask(currentTask))
    }
  }, [activeTask, taskId])

  const handleToggleArchive = async () => {
    if (isArchived === undefined) return // Prevent toggling if state isn't initialized yet

    const newIsArchived = !isArchived
    const optimisticTask = { ...task, isArchived: newIsArchived }

    setIsArchived(newIsArchived) // Optimistically update local state
    try {
      await mutate(
        cacheKey,
        async () => {
          // Call the actual API to toggle isArchived
          await fetch(`/api/tasks/${taskId}?token=${requireLiveToken()}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isArchived: newIsArchived }),
          })

          // Re-fetch updated data
          const updatedTask = await fetcher(cacheKey)

          return updatedTask
        },
        {
          optimisticData: { task: optimisticTask }, // Update UI immediately
          rollbackOnError: true, // Revert on error
        },
      )
    } catch (error) {
      console.error('Failed to toggle archive status:', error)
      setIsArchived(!newIsArchived) // Revert local state on error
    }
  }

  if (userType === UserType.CLIENT_USER && !previewMode) return null

  // Handle loading and error states
  if (!task || isArchived === undefined) return <Skeleton variant="rectangular" width="60px" height="16px" />

  if (previewMode) {
    return <ArchiveBtn isArchived={isArchived} handleClick={handleToggleArchive} />
  }

  return <DetailAppBridge isArchived={isArchived} handleToggleArchive={handleToggleArchive} />
}
