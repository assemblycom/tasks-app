'use client'

import { setAssigneeList } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { useEffect } from 'react'
import { getAssignees } from '@/app/_cache/forageStorage'

interface ClientAssigneeCacheGetterProps {
  lookupKey: string
}

export const AssigneeCacheGetter = ({ lookupKey }: ClientAssigneeCacheGetterProps) => {
  useEffect(() => {
    const run = async () => {
      const assignee = await getAssignees(lookupKey)
      if (assignee.length) {
        store.dispatch(setAssigneeList(assignee))
      }
    }
    run()
  }, [lookupKey])

  return <></>
}
