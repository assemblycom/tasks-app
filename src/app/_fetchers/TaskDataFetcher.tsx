import { selectTaskBoard, setIsTasksLoading, setTasks } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { DisplayOptions } from '@/types/dto/viewSettings.dto'
import { PropsWithToken } from '@/types/interfaces'
import { fetcher } from '@/utils/fetcher'
import { useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import useSWR from 'swr'

export const TaskDataFetcher = ({ token }: PropsWithToken) => {
  const { showArchived, showUnarchived, showSubtasks, tasks } = useSelector(selectTaskBoard)

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

  const queryString = token ? buildQueryString(token, { showArchived, showUnarchived, showSubtasks }) : null

  const { data, isLoading } = useSWR(queryString ? `/api/tasks/?${queryString}` : null, fetcher, {
    fallbackData: { tasks },
    revalidateOnMount: false,
    revalidateOnFocus: false,
    refreshInterval: 0,
  })

  useEffect(() => {
    store.dispatch(setIsTasksLoading(isLoading))
  }, [isLoading])

  // Skip dispatching the initial `data`. On mount, `data` is either fallbackData (a snapshot of
  // redux that SSR/CSU has already populated) or SWR's cached response from a prior session —
  // which may be stale relative to redux if a realtime event ran while this component wasn't
  // mounted (e.g. a task deleted from the details page before redirecting back to the board,
  // OUT-3727). Redux is already authoritative in both cases.
  //
  // We compare against the initial `data` *reference* (captured via `useRef`) rather than a
  // boolean "is first run" flag, because in dev React Strict Mode runs effects twice on mount
  // with the same `data` — a boolean flag flips on the first run and lets the second run
  // dispatch, which re-introduces the stale cache. A reference check correctly treats both
  // strict-mode runs as "still the initial value, skip", and only dispatches when `data` is
  // actually replaced (filter toggle, key change, revalidation).
  const initialData = useRef(data).current
  useEffect(() => {
    if (data === initialData) return
    if (data?.tasks) {
      store.dispatch(setTasks(data.tasks))
    }
  }, [data, initialData])

  return null
}
