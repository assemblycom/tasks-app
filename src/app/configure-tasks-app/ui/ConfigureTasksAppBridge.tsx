'use client'

import { useActionsMenu } from '@/hooks/app-bridge/useActionsMenu'
import { useBreadcrumbs } from '@/hooks/app-bridge/useBreadcrumbs'

interface ConfigureTasksAppBridgeProps {
  portalUrl?: string
}

export const ConfigureTasksAppBridge = ({ portalUrl }: ConfigureTasksAppBridgeProps) => {
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
