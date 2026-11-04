import { loadTemplates } from '@/app/_fetchers/loaders'
import { ClientSideStateUpdate } from '@/hoc/ClientSideStateUpdate'
import User from '@api/core/models/User.model'
import { PropsWithChildren } from 'react'

export const TemplatesFetcher = async ({ user, children }: PropsWithChildren & { user: User }) => {
  const templates = await loadTemplates(user)

  return <ClientSideStateUpdate templates={templates}>{children}</ClientSideStateUpdate>
}
