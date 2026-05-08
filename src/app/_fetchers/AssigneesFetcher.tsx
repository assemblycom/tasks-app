'use client'

import { MAX_FETCH_ASSIGNEE_COUNT } from '@/constants/users'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { setAssigneeList } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { IAssignee } from '@/types/interfaces'
import { addTypeToAssignee } from '@/utils/addTypeToAssignee'
import { fetcher } from '@/utils/fetcher'
import { getPreviewMode } from '@/utils/previewMode'
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import useSWR from 'swr'

// Module-level flag: ensures exactly one fetch per layout-mount lifetime, even
// when AssigneeCacheGetter pre-populates redux from IndexedDB on cold load.
let hasFetched = false

interface AssigneesPayload {
  users?: IAssignee
  clients?: IAssignee
}

export const AssigneesFetcher = () => {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { tokenPayload } = useSelector(selectAuthDetails)

  const isPreview = !!(tokenPayload && getPreviewMode(tokenPayload))
  const isClientUser = !!tokenPayload?.clientId && !tokenPayload?.internalUserId
  const useClientEndpoint = isClientUser && !isPreview

  const endpoint =
    token && tokenPayload
      ? useClientEndpoint
        ? `/api/users/client?token=${token}&limit=${MAX_FETCH_ASSIGNEE_COUNT}`
        : `/api/users?token=${token}&limit=${MAX_FETCH_ASSIGNEE_COUNT}`
      : null

  const shouldFetch = !!endpoint && !hasFetched
  const { data } = useSWR<AssigneesPayload>(shouldFetch ? endpoint : null, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })

  useEffect(() => {
    if (!data) return
    const list = useClientEndpoint ? data.clients : data.users
    if (!list) return
    store.dispatch(setAssigneeList(addTypeToAssignee(list)))
    hasFetched = true
  }, [data, useClientEndpoint])

  return null
}
