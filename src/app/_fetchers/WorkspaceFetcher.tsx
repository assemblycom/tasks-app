'use client'

import { selectAuthDetails, setWorkspace } from '@/redux/features/authDetailsSlice'
import store from '@/redux/store'
import { WorkspaceResponse } from '@/types/common'
import { fetcher } from '@/utils/fetcher'
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import useSWR from 'swr'

export const WorkspaceFetcher = () => {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { workspace } = useSelector(selectAuthDetails)

  const shouldFetch = !!token && !workspace
  const { data } = useSWR<WorkspaceResponse>(shouldFetch ? `/api/workspace?token=${token}` : null, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  })

  useEffect(() => {
    if (data) {
      store.dispatch(setWorkspace(data))
    }
  }, [data])

  return null
}
