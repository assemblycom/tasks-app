'use client'

import { setAssignees as setAssigneesIDB } from '@/app/_cache/forageStorage'
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

  const { data } = useSWR<AssigneesPayload>(endpoint, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })

  useEffect(() => {
    if (!data || !tokenPayload) return
    const list = useClientEndpoint ? data.clients : data.users
    if (!list) return
    const combined = addTypeToAssignee(list)
    store.dispatch(setAssigneeList(combined))

    const { internalUserId, clientId, companyId } = tokenPayload
    const lookupKey = clientId && companyId ? `${clientId}.${companyId}` : internalUserId
    if (lookupKey) {
      void setAssigneesIDB(lookupKey, combined)
    }
  }, [data, useClientEndpoint, tokenPayload])

  return null
}
