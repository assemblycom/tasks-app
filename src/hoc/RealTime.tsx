'use client'

import { TASKS_LIST_SWR_KEY } from '@/app/_fetchers/TaskDataFetcher'
import { RealtimeHandler } from '@/lib/realtime'
import { supabase } from '@/lib/supabase'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { selectTaskDetails } from '@/redux/features/taskDetailsSlice'
import { Token } from '@/types/common'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { isTaskPayloadEqual } from '@/utils/isRealtimePayloadEqual'
import { AssigneeType } from '@prisma/client'
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { mutate } from 'swr'

export interface RealTimeTaskResponse extends TaskResponse {
  assigneeId: string
  assigneeType: AssigneeType
  parentId: string | null
  deletedAt: string
}

export const RealTime = ({
  children,
  task,
  tokenPayload,
}: {
  children: ReactNode
  task?: TaskResponse
  tokenPayload: Token
}) => {
  const { tasks, accessibleTasks, token, activeTask, assignee, accesibleTaskIds } = useSelector(selectTaskBoard)
  const { fromNotificationCenter } = useSelector(selectTaskDetails)
  const pathname = usePathname()
  const router = useRouter()

  const userId = tokenPayload?.clientId || tokenPayload?.companyId || tokenPayload?.internalUserId
  const userRole =
    tokenPayload?.companyId || tokenPayload?.clientId
      ? AssigneeType.client
      : tokenPayload?.internalUserId
        ? AssigneeType.internalUser
        : undefined

  if (!tokenPayload || !userId || !userRole) {
    console.error(`Failed to authenticate a realtime connection for id ${userId} with role ${userRole}`)
  }

  const redirectToBoard = (updatedTask: RealTimeTaskResponse) => {
    //disable board navigation if not in details page or from notification-center-view
    if (!pathname.includes('detail') || fromNotificationCenter) return

    const isClientUser = pathname.includes('cu')
    const isAccessibleSubtask = updatedTask.parentId && accessibleTasks.some((task) => task.id === updatedTask.parentId)

    if (isClientUser) {
      router.push(isAccessibleSubtask ? `/detail/${updatedTask.parentId}/cu?token=${token}` : `/client?token=${token}`)
    } else {
      router.push(isAccessibleSubtask ? `/detail/${updatedTask.parentId}/iu/?token=${token}` : `/?token=${token}`)
    }
  }

  const handleRealtimeEvents = (payload: RealtimePostgresChangesPayload<RealTimeTaskResponse>) => {
    if (isTaskPayloadEqual(payload)) {
      return //no changes for the same payload
    }
    const user = assignee.find((el) => el.id === userId)
    if (!user || !userRole) return

    mutate([TASKS_LIST_SWR_KEY], undefined, { revalidate: false }).then()

    const realtimeHandler = new RealtimeHandler(payload, user, userRole, redirectToBoard, tokenPayload)
    const isSubtask =
      Object.keys(payload.new).includes('parentId') && (payload.new as RealTimeTaskResponse).parentId !== null

    if (isSubtask) {
      return realtimeHandler.handleRealtimeSubtasks()
    }
    if (payload.eventType === 'INSERT') {
      return realtimeHandler.handleRealtimeTaskInsert()
    }
    if (payload.eventType === 'UPDATE') {
      return realtimeHandler.handleRealtimeTaskUpdate()
    }

    console.error('Unknown event type for realtime handler')
  }

  useEffect(() => {
    if (!userId || !userRole) {
      // Don't try to open a connection with `undefined` parameters
      return
    }

    const channel = supabase
      .channel('realtime tasks')
      .on(
        'postgres_changes',
        // Because of the way supabase realtime is architected for postgres_changes, it can only apply one filter at a time.
        // Ref: https://github.com/supabase/realtime-js/issues/97
        {
          event: '*',
          schema: 'public',
          table: 'Tasks',
          filter: `workspaceId=eq.${tokenPayload?.workspaceId}`,
        },
        handleRealtimeEvents,
      )
      .subscribe()
    // console.info('Connected to realtime channel', channel)

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, tasks, assignee])

  return children
}
