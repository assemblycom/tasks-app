export const fetchCache = 'force-no-store'

import { apiUrl } from '@/config'
import { fetchWithErrorHandler } from '@/app/_fetchers/fetchWithErrorHandler'
import { ClientSideStateUpdate } from '@/hoc/ClientSideStateUpdate'
import { ITemplate, PropsWithToken } from '@/types/interfaces'
import { PropsWithChildren } from 'react'

const getAllTemplates = async (token: string): Promise<ITemplate[]> => {
  const { data } = await fetchWithErrorHandler<{ data: ITemplate[] }>(`${apiUrl}/api/tasks/templates?token=${token}`, {
    next: { tags: ['getAllTemplates'] },
  })
  return data
}

export const TemplatesFetcher = async ({ token, children }: PropsWithChildren & PropsWithToken) => {
  const templates = await getAllTemplates(token)

  return <ClientSideStateUpdate templates={templates}>{children}</ClientSideStateUpdate>
}
