import { selectTaskBoard, setHasArchiveFilterChanged, setIsTasksLoading, setTasks } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { DisplayOptions } from '@/types/dto/viewSettings.dto'
import { PropsWithToken } from '@/types/interfaces'
import { fetcher } from '@/utils/fetcher'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import useSWR from 'swr'

// Stable cache tag for the tasks-list query. Used as the first element of every SWR cache key
// in this file so realtime invalidation can wipe every filter-combo cache entry with a single
// matcher (see `src/hoc/RealTime.tsx`). Do not change without updating the realtime invalidator.
export const TASKS_LIST_SWR_KEY = 'tasks-list'

const buildQueryString = (token: string, displayOptions?: DisplayOptions) => {
  const queryParams = new URLSearchParams({ token })
  if (displayOptions?.showArchived !== undefined) {
    queryParams.append('showArchived', displayOptions.showArchived.toString())
  }
  if (displayOptions?.showUnarchived !== undefined) {
    queryParams.append('showUnarchived', displayOptions.showUnarchived.toString())
  }

  return queryParams.toString()
}

export const TaskDataFetcher = ({ token }: PropsWithToken) => {
  const { showArchived, showUnarchived, showSubtasks, hasArchiveFilterChanged } = useSelector(selectTaskBoard)

  const queryString = token ? buildQueryString(token, { showArchived, showUnarchived, showSubtasks }) : null

  const { data, isLoading } = useSWR(
    hasArchiveFilterChanged && queryString ? [TASKS_LIST_SWR_KEY, queryString] : null,
    () => fetcher(`/api/tasks/?${queryString}`),
    {
      revalidateOnMount: true,
      revalidateOnFocus: false,
      refreshInterval: 0,
      onSuccess: () => {
        /*
          Note:- This is needed, otherwise query key would be null and data would be gone before setting tasks via useEffect
         */
        store.dispatch(setTasks(data.tasks))
        store.dispatch(setHasArchiveFilterChanged(false))
      },
    },
  )

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
