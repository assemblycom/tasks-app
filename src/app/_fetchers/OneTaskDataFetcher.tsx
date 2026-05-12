'use client'

import { setActiveTask } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { PropsWithToken } from '@/types/interfaces'
import { fetcher } from '@/utils/fetcher'
import { extractImgSrcs, replaceImgSrcs } from '@/utils/signedUrlReplacer'
import { useEffect, useRef, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'

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
  const swrKey = queryString ? `/api/tasks/${task_id}?${queryString}` : null

  const { mutate } = useSWRConfig()

  // When falling back to SSR data, overwrite any stale SWR cache entry from a
  // prior visit with the fresh initialTask before SWR reads from it. Without
  // this, fallbackData would be ignored on revisit (cache already populated)
  // and revalidateOnMount: false would suppress the refetch — letting stale
  // data win over the newer SSR render.
  useEffect(() => {
    if (useFallback && swrKey && initialTask) {
      mutate(swrKey, { task: initialTask }, { revalidate: false })
    }
  }, [swrKey, useFallback, initialTask, mutate])

  const { data } = useSWR(swrKey, fetcher, {
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
