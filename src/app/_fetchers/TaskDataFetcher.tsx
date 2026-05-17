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

type TasksListSwrKey = [typeof TASKS_LIST_SWR_KEY, string, boolean | undefined, boolean | undefined, boolean | undefined]

export const TaskDataFetcher = ({ token }: PropsWithToken) => {
  const { showArchived, showUnarchived, showSubtasks, hasArchiveFilterChanged } = useSelector(selectTaskBoard)

  const buildQueryString = (token: string, displayOptions?: DisplayOptions) => {
    const queryParams = new URLSearchParams({ token })
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

  // Only fetch when the user has actually toggled an archive filter. SSR + realtime keep
  // `tasks` fresh; refetching on mount would clobber realtime updates with stale cache.
  const shouldFetch = !!token && hasArchiveFilterChanged
  const swrKey: TasksListSwrKey | null = shouldFetch
    ? [TASKS_LIST_SWR_KEY, token, showArchived, showUnarchived, showSubtasks]
    : null

  const { data, isLoading } = useSWR(
    swrKey,
    ([, t, sa, su, ss]: TasksListSwrKey) =>
      fetcher(`/api/tasks/?${buildQueryString(t, { showArchived: sa, showUnarchived: su, showSubtasks: ss })}`),
    {
      revalidateOnMount: false,
      revalidateOnFocus: false,
      refreshInterval: 0,
    },
  )

  useEffect(() => {
    store.dispatch(setIsTasksLoading(isLoading))
  }, [isLoading])

  useEffect(() => {
    if (data?.tasks) {
      store.dispatch(setTasks(data.tasks))
      store.dispatch(setHasArchiveFilterChanged(false))
    }
  }, [data])

  return null
}
