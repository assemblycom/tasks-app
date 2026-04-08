'use client'

import { Icons } from '@/hooks/app-bridge/types'
import { useAwake } from '@/hooks/app-bridge/useAwake'
import { usePrimaryCta } from '@/hooks/app-bridge/usePrimaryCta'
import { useSecondaryCta } from '@/hooks/app-bridge/useSecondaryCta'
import { useCallback, useEffect, useState } from 'react'

interface DetailAppBridgeProps {
  handleTaskComplete: () => void
  isTaskCompleted: boolean
}

export const ClientDetailAppBridge = ({ handleTaskComplete, isTaskCompleted }: DetailAppBridgeProps) => {
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
  )
  useSecondaryCta(null)

  return <></>
}
