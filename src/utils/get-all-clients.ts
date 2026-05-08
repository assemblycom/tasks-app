import { cacheLife, cacheTag, updateTag } from 'next/cache'

import { copilotAPIKey as apiKey, assemblyApiDomain } from '@/config'
import { ClientResponse } from '@/types/common'

const PAGE_LIMIT = 5_000

const tagFor = (workspaceId: string) => `all-clients:${workspaceId}`

async function fetchAllClientsCached(workspaceId: string): Promise<ClientResponse[]> {
  'use cache'
  cacheLife('hours')
  cacheTag(tagFor(workspaceId))

  const clients: ClientResponse[] = []
  let nextToken: string | undefined

  do {
    const url = new URL(`${assemblyApiDomain}/v1/clients`)
    url.searchParams.set('limit', String(PAGE_LIMIT))
    if (nextToken) url.searchParams.set('nextToken', nextToken)

    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-API-KEY': `${workspaceId}/${apiKey}`,
        accept: 'application/json',
      },
    })

    if (!resp.ok) {
      throw new Error(`getAllClients | ${resp.status} ${resp.statusText}`)
    }

    const body = (await resp.json()) as { data: ClientResponse[] | null; nextToken?: string }
    if (body.data) clients.push(...body.data)
    nextToken = body.nextToken
  } while (nextToken)

  return clients
}

export async function getAllClients(workspaceId: string): Promise<ClientResponse[]> {
  try {
    return await fetchAllClientsCached(workspaceId)
  } catch (err) {
    updateTag(tagFor(workspaceId))
    throw err
  }
}
