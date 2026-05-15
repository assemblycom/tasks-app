import { selectTaskBoard, setIsTasksLoading, setTasks } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { DisplayOptions } from '@/types/dto/viewSettings.dto'
import { PropsWithToken } from '@/types/interfaces'
import { fetcher } from '@/utils/fetcher'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import useSWR from 'swr'
import { TaskResponse } from '@/types/dto/tasks.dto'

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

    return queryParams.toString()
  }

  const queryString = token ? buildQueryString(token, { showArchived, showUnarchived, showSubtasks }) : null

  const { isLoading } = useSWR<{ tasks: TaskResponse[] }>(queryString ? `/api/tasks/?${queryString}` : null, fetcher, {
    fallbackData: { tasks },
    revalidateOnMount: false,
    revalidateOnFocus: false,
    refreshInterval: 0,
    onSuccess: (data) => {
      store.dispatch(setTasks(data.tasks))
    },
  })

  useEffect(() => {
    store.dispatch(setIsTasksLoading(isLoading))
  }, [isLoading])

  return null
}
