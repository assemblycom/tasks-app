'use client'

import { setActiveTask } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { PropsWithToken } from '@/types/interfaces'
import { fetcher } from '@/utils/fetcher'
import { extractImgSrcs, replaceImgSrcs } from '@/utils/signedUrlReplacer'
import { useEffect } from 'react'
import useSWR from 'swr'

interface OneTaskDataFetcherProps extends PropsWithToken {
  task_id: string
  initialTask: TaskResponse
}

export const OneTaskDataFetcher = ({ token, task_id, initialTask }: OneTaskDataFetcherProps) => {
  const buildQueryString = (token: string) => {
    const queryParams = new URLSearchParams({ token })

    return queryParams.toString()
  }

  const queryString = token ? buildQueryString(token) : null

  const { data } = useSWR(queryString ? `/api/tasks/${task_id}?${queryString}` : null, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    // The mount fetch is redundant — SSR seeds the same getOneTask result into Redux — and races with
    // in-progress edits, reverting them when it resolves late. Only revalidate when explicitly asked
    // (realtime nudges this key via globalMutate to refresh access-filtered subtask counts).
    revalidateOnMount: false,
    revalidateIfStale: false,
    ...(initialTask
      ? {
          fallbackData: { task: initialTask },
        }
      : {}),
  })

  useEffect(() => {
    if (data?.task) {
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
  }, [data, initialTask])

  return null
}
