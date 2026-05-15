import { selectTaskBoard, setIsTasksLoading, setTasks } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { DisplayOptions } from '@/types/dto/viewSettings.dto'
import { PropsWithToken } from '@/types/interfaces'
import { fetcher } from '@/utils/fetcher'
import { useEffect, useMemo } from 'react'
import { useSelector } from 'react-redux'
import useSWR from 'swr'
import { TaskResponse } from '@/types/dto/tasks.dto'

interface Props extends PropsWithToken {
  showArchived?: boolean
  showUnarchived?: boolean
}

export const TaskDataFetcher = ({ token, ...props }: Props) => {
  const { showArchived, showUnarchived, showSubtasks } = useSelector(selectTaskBoard)

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

  const hasChanged = useMemo(() => {
    if (props.showArchived !== showArchived) {
      return true
    }

    if (props.showUnarchived !== showUnarchived) {
      return true
    }
  }, [props.showArchived, props.showUnarchived, showUnarchived, showArchived])

  const queryString = token ? buildQueryString(token, { showArchived, showUnarchived, showSubtasks }) : null

  const { isLoading, data } = useSWR<{ tasks: TaskResponse[] }>(queryString ? `/api/tasks/?${queryString}` : null, fetcher, {
    revalidateOnMount: false,
    revalidateOnFocus: false,
    refreshInterval: 0,
  })

  useEffect(() => {
    store.dispatch(setIsTasksLoading(isLoading))
  }, [isLoading])

  useEffect(() => {
    if (data?.tasks && hasChanged) {
      store.dispatch(setTasks(data.tasks))
    }
  }, [data, hasChanged])

  return null
}
