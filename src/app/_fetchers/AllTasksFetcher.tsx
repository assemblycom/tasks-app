import { loadTasks } from '@/app/_fetchers/loaders'
import { ClientSideStateUpdate } from '@/hoc/ClientSideStateUpdate'
import User from '@api/core/models/User.model'
import { PropsWithChildren } from 'react'

export const AllTasksFetcher = async ({ user, children }: PropsWithChildren & { user: User }) => {
  const accessibleTasks = await loadTasks({ user, all: true })

  return <ClientSideStateUpdate accessibleTasks={accessibleTasks}>{children}</ClientSideStateUpdate>
}
