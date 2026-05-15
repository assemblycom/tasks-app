import { selectTaskBoard, setIsTasksLoading, setTasks } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { DisplayOptions } from '@/types/dto/viewSettings.dto'
import { PropsWithToken } from '@/types/interfaces'
import { fetcher } from '@/utils/fetcher'
import { useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import useSWR, { mutate } from 'swr'
import { TaskResponse } from '@/types/dto/tasks.dto'

const TASK_LIST_KEY_PREFIX = '/api/tasks/?'

const buildQueryString = (token: string, displayOptions?: DisplayOptions) => {
  const queryParams = new URLSearchParams({ token })
  if (displayOptions?.showArchived !== undefined && displayOptions.showArchived) {
    queryParams.append('showArchived', displayOptions.showArchived.toString())
  }
  if (displayOptions?.showUnarchived !== undefined) {
    queryParams.append('showUnarchived', displayOptions.showUnarchived.toString())
  }

  return queryParams.toString()
}

export const TaskDataFetcher = ({ token }: PropsWithToken) => {
  const { showArchived, showUnarchived, showSubtasks, tasks: tasksInStore } = useSelector(selectTaskBoard)

  const skipFetch = !showArchived && !showUnarchived
  const queryString = token && !skipFetch ? buildQueryString(token, { showArchived, showUnarchived, showSubtasks }) : null
  const swrKey = queryString ? `${TASK_LIST_KEY_PREFIX}${queryString}` : null

  // Tracks the `tasks` array this component last wrote into Redux. Realtime is the only
  // other writer for this slice, so when Redux's `tasks` ref diverges from this we know
  // realtime updated the store and every cached task-list response is now stale.
  const lastWrittenTasksRef = useRef<TaskResponse[]>(tasksInStore)

  const { isLoading, data } = useSWR<{ tasks: TaskResponse[] }>(swrKey, fetcher, {
    fallbackData: { tasks: tasksInStore },
    revalidateOnMount: false,
    revalidateOnFocus: false,
    refreshInterval: 0,
  })

  useEffect(() => {
    store.dispatch(setIsTasksLoading(isLoading))
  }, [isLoading])

  useEffect(() => {
    if (!data?.tasks) return
    lastWrittenTasksRef.current = data.tasks
    store.dispatch(setTasks(data.tasks))
  }, [data])

  useEffect(() => {
    if (tasksInStore === lastWrittenTasksRef.current) return
    lastWrittenTasksRef.current = tasksInStore
    mutate((key) => typeof key === 'string' && key.startsWith(TASK_LIST_KEY_PREFIX), undefined, { revalidate: false })
  }, [tasksInStore])

  return null
}
