'use client'

import { Icons } from '@/hooks/app-bridge/types'
import { useActionsMenu } from '@/hooks/app-bridge/useActionsMenu'
import { useBreadcrumbs } from '@/hooks/app-bridge/useBreadcrumbs'
import { usePrimaryCta } from '@/hooks/app-bridge/usePrimaryCta'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { setShowTemplateModal } from '@/redux/features/templateSlice'
import store from '@/redux/store'
import { TargetMethod } from '@/types/interfaces'
import { UserRole } from '@api/core/types/user'
import { useSelector } from 'react-redux'

interface TaskBoardAppBridgeProps {
  token: string
  role: UserRole
}

export const ManageTemplatesAppBridge = ({ token, role }: TaskBoardAppBridgeProps) => {
  const { workspace } = useSelector(selectAuthDetails)
  const portalUrl = workspace?.portalUrl
  const handleTemplateCreate = () => {
    store.dispatch(setShowTemplateModal({ targetMethod: TargetMethod.POST }))
  }

  usePrimaryCta(
    {
      label: 'Create template',
      icon: Icons.PLUS,
      onClick: handleTemplateCreate,
    },
    { portalUrl },
  )
  useActionsMenu([], { portalUrl })
  useBreadcrumbs(
    [
      {
        label: 'Manage templates',
      },
    ],
    { portalUrl },
  )

  return <></>
}
