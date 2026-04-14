'use client'

import { Icons } from '@/hooks/app-bridge/types'
import { useActionsMenu } from '@/hooks/app-bridge/useActionsMenu'
import { useAwake } from '@/hooks/app-bridge/useAwake'
import { useBreadcrumbs } from '@/hooks/app-bridge/useBreadcrumbs'
import { usePrimaryCta } from '@/hooks/app-bridge/usePrimaryCta'
import { useSecondaryCta } from '@/hooks/app-bridge/useSecondaryCta'
import { setShowModal } from '@/redux/features/createTaskSlice'
import store from '@/redux/store'
import { UserRole } from '@api/core/types/user'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

interface TaskBoardAppBridgeProps {
  token: string
  role: UserRole
  isTaskBoardEmpty?: boolean
}

export const TaskBoardAppBridge = ({ token, role, isTaskBoardEmpty = false }: TaskBoardAppBridgeProps) => {
  const router = useRouter()
  const awake = useAwake()

  const handleTaskCreate = useCallback(() => {
    store.dispatch(setShowModal())
    // "awaken" callback using one more render to avoid hydration issues
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awake])

  const handleManageTemplatesClick = () => {
    router.push(`/manage-templates?token=${token}`)
  }

  usePrimaryCta(
    role == UserRole.Client || isTaskBoardEmpty
      ? null
      : {
          label: 'Create task',
          icon: Icons.PLUS,
          onClick: handleTaskCreate,
        },
  )

  // Unset "Unarchive" button from tasks details if redirected to board from an archived task
  useSecondaryCta(null)

  useActionsMenu(
    role == UserRole.Client
      ? []
      : [
          {
            label: 'Manage templates',
            icon: Icons.TEMPLATES,
            onClick: handleManageTemplatesClick,
          },
        ],
  )
  useBreadcrumbs([])

  return <></>
}
