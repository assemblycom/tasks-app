export const fetchCache = 'force-no-store'

import { apiUrl } from '@/config'
import { fetchWithErrorHandler } from '@/app/_fetchers/fetchWithErrorHandler'
import { ClientSideStateUpdate } from '@/hoc/ClientSideStateUpdate'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { PropsWithToken } from '@/types/interfaces'
import { PropsWithChildren } from 'react'

const getAllAccessibleTasks = async (token: string): Promise<TaskResponse[]> => {
  const { tasks } = await fetchWithErrorHandler<{ tasks: TaskResponse[] }>(`${apiUrl}/api/tasks?token=${token}&all=1`)
  return tasks
}

export const AllTasksFetcher = async ({ token, children }: PropsWithChildren & PropsWithToken) => {
  const accessibleTasks = await getAllAccessibleTasks(token)

  return <ClientSideStateUpdate accessibleTasks={accessibleTasks}>{children}</ClientSideStateUpdate>
}
