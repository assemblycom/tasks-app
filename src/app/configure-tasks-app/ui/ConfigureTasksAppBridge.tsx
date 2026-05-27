'use client'

import { useActionsMenu } from '@/hooks/app-bridge/useActionsMenu'
import { useBreadcrumbs } from '@/hooks/app-bridge/useBreadcrumbs'
import { useSelector } from 'react-redux'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'

export const ConfigureTasksAppBridge = () => {
  const { workspace } = useSelector(selectAuthDetails)
  const portalUrl = workspace?.portalUrl

  useActionsMenu([], { portalUrl })
  useBreadcrumbs([{ label: 'Configure Tasks App' }], { portalUrl })

  return null
}
