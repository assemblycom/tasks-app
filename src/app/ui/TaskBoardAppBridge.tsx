'use client'

import { Icons } from '@/hooks/app-bridge/types'
import { useActionsMenu } from '@/hooks/app-bridge/useActionsMenu'
import { useAwake } from '@/hooks/app-bridge/useAwake'
import { useBreadcrumbs } from '@/hooks/app-bridge/useBreadcrumbs'
import { usePrimaryCta } from '@/hooks/app-bridge/usePrimaryCta'
import { useSecondaryCta } from '@/hooks/app-bridge/useSecondaryCta'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { setShowModal } from '@/redux/features/createTaskSlice'
import store from '@/redux/store'
import { UserRole } from '@api/core/types/user'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { useSelector } from 'react-redux'

interface TaskBoardAppBridgeProps {
  token: string
  role: UserRole
  isTaskBoardEmpty?: boolean
}

export const TaskBoardAppBridge = ({ token, role, isTaskBoardEmpty = false }: TaskBoardAppBridgeProps) => {
  const { workspace } = useSelector(selectAuthDetails)
  const portalUrl = workspace?.portalUrl
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
