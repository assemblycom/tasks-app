'use client'

import { setToken } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { setLiveToken } from '@/utils/assemblyTokenStore'
import { AssemblyBridge } from '@assembly-js/app-bridge'
import { useEffect, useState } from 'react'

/**
 * Subscribes to token updates pushed by the Assembly parent dashboard.
 *
 * Initial seed runs synchronously via useState lazy init so that any child
 * effect or event handler firing before the subscription is mounted still
 * sees a token in the module-level store.
 *
 * On each update we:
 *   1. Write to the module-level live store (read by imperative call sites).
 *   2. Dispatch into Redux (for selectors that already read the token).
 *   3. Rewrite the `?token=` URL param via history.replaceState so any
 *      subsequent SSR / middleware sees the fresh token.
 *
 * Mount once, near the top of the client tree.
 */
export const useTokenRefresh = (initialToken?: string) => {
  useState(() => {
    if (initialToken) {
      setLiveToken(initialToken)
    }
    return null
  })

  useEffect(() => {
    const apply = (next: string) => {
      setLiveToken(next)
      store.dispatch(setToken(next))
      try {
        const url = new URL(window.location.href)
        url.searchParams.set('token', next)
        window.history.replaceState(null, '', url.toString())
      } catch {
        // history.replaceState can throw in rare iframe sandbox setups; the
        // in-memory token + Redux state are still fresh, so requests still work.
      }
    }

    const current = AssemblyBridge.sessionToken.getCurrent()
    if (current?.token) {
      apply(current.token)
    }

    const unsubscribe = AssemblyBridge.sessionToken.onTokenUpdate((data) => {
      if (data?.token) apply(data.token)
    })

    return unsubscribe
  }, [])
}
