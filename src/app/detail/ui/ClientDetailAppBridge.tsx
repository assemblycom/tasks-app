'use client'

import { Icons } from '@/hooks/app-bridge/types'
import { useAwake } from '@/hooks/app-bridge/useAwake'
import { usePrimaryCta } from '@/hooks/app-bridge/usePrimaryCta'
import { useSecondaryCta } from '@/hooks/app-bridge/useSecondaryCta'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { useCallback } from 'react'
import { useSelector } from 'react-redux'

interface DetailAppBridgeProps {
  handleTaskComplete: () => void
  isTaskCompleted: boolean
}

export const ClientDetailAppBridge = ({ handleTaskComplete, isTaskCompleted }: DetailAppBridgeProps) => {
  const { workspace } = useSelector(selectAuthDetails)
  const portalUrl = workspace?.portalUrl
  const awake = useAwake()

  const handleMarkAsDone = useCallback(() => {
    handleTaskComplete()
    // "awaken" callback using one more render to avoid hydration issues
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awake])

  usePrimaryCta(
    isTaskCompleted
      ? null
      : {
          label: 'Mark as Done',
          icon: Icons.CHECK,
          onClick: handleMarkAsDone,
        },
    { portalUrl },
  )
  useSecondaryCta(null, { portalUrl })

  return <></>
}
