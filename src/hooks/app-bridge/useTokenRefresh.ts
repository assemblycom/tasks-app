'use client'

import { AssemblyBridge } from '@assembly-js/app-bridge'
import { setToken } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { ensureHttps } from '@/utils/https'
import { useEffect } from 'react'

/**
 * Subscribes to token refresh events from the parent Copilot dashboard
 * via @assembly-js/app-bridge and pushes updated tokens into Redux.
 */
export function useTokenRefresh(portalUrl?: string) {
  useEffect(() => {
    if (portalUrl) {
      AssemblyBridge.configure({ additionalOrigins: [ensureHttps(portalUrl)] })
    }
  }, [portalUrl])

  useEffect(() => {
    const unsubscribe = AssemblyBridge.sessionToken.onTokenUpdate((data) => {
      store.dispatch(setToken(data.token))
    })
    return unsubscribe
  }, [])
}
