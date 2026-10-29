'use client'

import { DASHBOARD_DOMAIN } from '@/constants/domains'
import { BridgeHelloMessage, NavigateMessage, NavigateResultMessage } from '@/hooks/app-bridge/types'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { ensureHttps } from '@/utils/https'
import { useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { parsePortalAppLink } from './portalLinks'

const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

// Opens links to other apps in the same portal in place, by asking the portal to navigate
// instead of letting the browser open a second tab of it. The portal only answers `navigate`
// where its deep-linking flag is on, and it says so in `bridge.hello`; until that arrives the
// click is left alone, so the fallback is never a blocked popup but today's behaviour.
export const usePortalLinkBridge = () => {
  const { workspace } = useSelector(selectAuthDetails)
  const portalUrl = workspace?.portalUrl
  // The hello usually lands before the workspace has loaded, and the portal does not resend it
  // when portalUrl later arrives, so the accepted capability must outlive the effect below.
  const hostNavigatesRef = useRef(false)

  useEffect(() => {
    if (window.parent === window) return

    // The portal reaches us either on a dashboard domain or on the workspace's own portal
    // domain. The embedding page's origin is also accepted so a custom-domain portal whose
    // workspace record still names the default domain (or the reverse) keeps working.
    const portalOrigins = new Set<string>(DASHBOARD_DOMAIN)
    const configuredOrigin = portalUrl ? originOf(ensureHttps(portalUrl)) : null
    if (configuredOrigin) portalOrigins.add(configuredOrigin)
    const referrerOrigin = document.referrer ? originOf(document.referrer) : null
    if (referrerOrigin) portalOrigins.add(referrerOrigin)
    const origins = [...portalOrigins]

    const pending = new Map<string, string>()

    const postToPortal = (message: NavigateMessage) => {
      for (const origin of origins) window.parent.postMessage(message, origin)
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !portalOrigins.has(event.origin)) return
      const data = event.data as { type?: unknown } | undefined
      if (data?.type === 'bridge.hello') {
        const hello = data as Partial<BridgeHelloMessage>
        hostNavigatesRef.current = hello.features?.navigate === true
        return
      }
      if (data?.type === 'navigate.result') {
        const result = data as Partial<NavigateResultMessage>
        if (typeof result.requestId !== 'string') return
        const href = pending.get(result.requestId)
        if (href === undefined) return
        pending.delete(result.requestId)
        // The portal declined (app not installed for this viewer, not permitted): give the
        // browser's default back so the user still gets the link, just in a new tab.
        if (result.ok !== true) window.open(href, '_blank', 'noopener,noreferrer')
      }
    }

    const handleClick = (event: MouseEvent) => {
      if (!hostNavigatesRef.current || event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target : null
      const anchor = target?.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) return
      const link = parsePortalAppLink(anchor.href, origins)
      if (!link) return

      event.preventDefault()
      event.stopPropagation()
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      pending.set(requestId, anchor.href)
      postToPortal({ type: 'navigate', requestId, to: 'app', params: link })
    }

    window.addEventListener('message', handleMessage)
    document.addEventListener('click', handleClick, true)
    return () => {
      window.removeEventListener('message', handleMessage)
      document.removeEventListener('click', handleClick, true)
      pending.clear()
    }
  }, [portalUrl])
}

export const PortalLinkBridge = () => {
  usePortalLinkBridge()
  return null
}
