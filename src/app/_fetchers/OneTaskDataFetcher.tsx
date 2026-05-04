'use client'

import { setActiveTask } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { fetcher } from '@/utils/fetcher'
import { extractImgSrcs, replaceImgSrcs } from '@/utils/signedUrlReplacer'
import { useEffect } from 'react'
import useSWR from 'swr'

interface OneTaskDataFetcherProps {
  task_id: string
  initialTask: TaskResponse
}

export const OneTaskDataFetcher = ({ task_id, initialTask }: OneTaskDataFetcherProps) => {
  // Stable cache key — fetcher injects the live token at request time.
  const { data } = useSWR(`/api/tasks/${task_id}`, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  })

  useEffect(() => {
    if (data?.task) {
      //only invalidate cache on mount.
      const newTask = structuredClone(data.task)
      if (initialTask?.body && newTask.body === undefined) {
        newTask.body = initialTask?.body
      }
      if (initialTask && initialTask.body && newTask.body) {
        const oldImgSrcs = extractImgSrcs(initialTask.body)
        const newImgSrcs = extractImgSrcs(newTask.body)
        if (oldImgSrcs.length > 0 && newImgSrcs.length > 0) {
          newTask.body = replaceImgSrcs(newTask.body, newImgSrcs, oldImgSrcs)
        }
      }
      store.dispatch(setActiveTask(newTask))
    }
  }, [data])

  return null
}
