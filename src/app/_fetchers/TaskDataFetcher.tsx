'use client'

import { selectTaskBoard, setIsTasksLoading, setTasks } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { DisplayOptions } from '@/types/dto/viewSettings.dto'
import { fetcher } from '@/utils/fetcher'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import useSWR from 'swr'

export const TaskDataFetcher = () => {
  const { showArchived, showUnarchived, showSubtasks, tasks } = useSelector(selectTaskBoard)

  const buildQueryString = (displayOptions?: DisplayOptions) => {
    const queryParams = new URLSearchParams()
    if (displayOptions?.showArchived !== undefined) {
      queryParams.append('showArchived', displayOptions.showArchived.toString())
    }
    if (displayOptions?.showUnarchived !== undefined) {
      queryParams.append('showUnarchived', displayOptions.showUnarchived.toString())
    }

    // NOTE: We don't need to send showSubtasks as a param to `getTasks` since we
    // are currently implementing showSubtasks in UI only. Uncomment and proceed with handling
    // showSubtasks in GET /api/tasks if we handle from the backend

    // if (displayOptions?.showSubtasks !== undefined) {
    //   queryParams.append('showSubtasks', displayOptions.showSubtasks.toString())
    // }

    return queryParams.toString()
  }

  // Stable cache key — fetcher injects the live token at request time.
  const queryString = buildQueryString({ showArchived, showUnarchived, showSubtasks })
  const { data, isLoading } = useSWR(queryString ? `/api/tasks/?${queryString}` : `/api/tasks/`, fetcher, {
    fallbackData: { tasks },
    revalidateOnMount: false,
    revalidateOnFocus: false,
    refreshInterval: 0,
  })

  useEffect(() => {
    store.dispatch(setIsTasksLoading(isLoading))
  }, [isLoading])

  useEffect(() => {
    if (data?.tasks) {
      store.dispatch(setTasks(data.tasks))
    }
  }, [data])

  return null
}
