'use client'

import { Icons } from '@/hooks/app-bridge/types'
import { useActionsMenu } from '@/hooks/app-bridge/useActionsMenu'
import { useAwake } from '@/hooks/app-bridge/useAwake'
import { useBreadcrumbs } from '@/hooks/app-bridge/useBreadcrumbs'
import { usePrimaryCta } from '@/hooks/app-bridge/usePrimaryCta'
import { useSecondaryCta } from '@/hooks/app-bridge/useSecondaryCta'
import { setShowModal } from '@/redux/features/createTaskSlice'
import store from '@/redux/store'
import { requireLiveToken } from '@/utils/assemblyTokenStore'
import { UserRole } from '@api/core/types/user'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

interface TaskBoardAppBridgeProps {
  role: UserRole
  portalUrl?: string
  isTaskBoardEmpty?: boolean
}

export const TaskBoardAppBridge = ({ role, portalUrl, isTaskBoardEmpty = false }: TaskBoardAppBridgeProps) => {
  const router = useRouter()
  const awake = useAwake()

  const handleTaskCreate = useCallback(() => {
    store.dispatch(setShowModal())
    // "awaken" callback using one more render to avoid hydration issues
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awake])

  const handleManageTemplatesClick = () => {
    router.push(`/manage-templates?token=${requireLiveToken()}`)
  }

  usePrimaryCta(
    role == UserRole.Client || isTaskBoardEmpty
      ? null
      : {
          label: 'Create task',
          icon: Icons.PLUS,
          onClick: handleTaskCreate,
        },
    { portalUrl },
  )

  // Unset "Unarchive" button from tasks details if redirected to board from an archived task
  useSecondaryCta(null, { portalUrl })

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
    { portalUrl },
  )
  useBreadcrumbs([], { portalUrl })

  return <></>
}
