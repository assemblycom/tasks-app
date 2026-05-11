'use client'

import { setActiveTask } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { PropsWithToken } from '@/types/interfaces'
import { fetcher } from '@/utils/fetcher'
import { extractImgSrcs, replaceImgSrcs } from '@/utils/signedUrlReplacer'
import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'

interface OneTaskDataFetcherProps extends PropsWithToken {
  task_id: string
  initialTask: TaskResponse
  /** When true, seed SWR with initialTask and skip the mount-time refetch. */
  useFallback?: boolean
}

export const OneTaskDataFetcher = ({
  token,
  task_id,
  initialTask,
  useFallback,
}: OneTaskDataFetcherProps & PropsWithToken) => {
  const buildQueryString = (token: string) => {
    const queryParams = new URLSearchParams({ token })

    return queryParams.toString()
  }

  const queryString = token ? buildQueryString(token) : null

  const { data } = useSWR(queryString ? `/api/tasks/${task_id}?${queryString}` : null, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    ...(useFallback
      ? {
          fallbackData: { task: initialTask },
          revalidateOnMount: false,
        }
      : {}),
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
