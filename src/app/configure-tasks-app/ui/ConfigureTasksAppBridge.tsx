'use client'

import { useActionsMenu } from '@/hooks/app-bridge/useActionsMenu'
import { useBreadcrumbs } from '@/hooks/app-bridge/useBreadcrumbs'

interface ConfigureTasksAppBridgeProps {
  portalUrl?: string
  appDisplayName?: string | null
}

export const ConfigureTasksAppBridge = ({ portalUrl, appDisplayName }: ConfigureTasksAppBridgeProps) => {
  useActionsMenu([], { portalUrl })
  useBreadcrumbs(
    [
      {
        label: appDisplayName ? `Configure ${appDisplayName}` : 'Configure',
      },
    ],
    { portalUrl },
  )

  return <></>
}
