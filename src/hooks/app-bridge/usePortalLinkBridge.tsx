'use client'

import { DASHBOARD_DOMAIN } from '@/constants/domains'
import { BridgeHelloMessage, NavigateMessage, NavigateResultMessage } from '@/hooks/app-bridge/types'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { ensureHttps } from '@/utils/https'
import { Button, Snackbar } from '@mui/material'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { parsePortalAppLink } from './portalLinks'

// A reply normally lands within a frame or two. The deadline stays well inside the browser's
// user-activation window (5s), so a `window.open` fallback fired on timeout is still treated as
// user-initiated rather than a popup.
const NAVIGATE_REPLY_TIMEOUT_MS = 1500
const FALLBACK_ATTR = 'data-portal-link-fallback'

interface PendingNavigation {
  href: string
  timer: ReturnType<typeof setTimeout>
}

const originOf = (url: string): string | null => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

const collectPortalOrigins = (portalUrl?: string): string[] => {
  // The portal reaches us either on a dashboard domain or on the workspace's own portal
  // domain. The embedding page's origin is also accepted so a custom-domain portal whose
  // workspace record still names the default domain (or the reverse) keeps working.
  const origins = new Set<string>(DASHBOARD_DOMAIN)
  const configuredOrigin = portalUrl ? originOf(ensureHttps(portalUrl)) : null
  if (configuredOrigin) origins.add(configuredOrigin)
  const referrerOrigin = document.referrer ? originOf(document.referrer) : null
  if (referrerOrigin) origins.add(referrerOrigin)
  return [...origins]
}

// Opening with the `noopener` feature makes `window.open` return null even on success, so the
// opener is severed by hand to keep the blocked-popup signal.
const openInNewTab = (href: string): boolean => {
  const opened = window.open(href, '_blank')
  if (!opened) return false
  opened.opener = null
  return true
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
  // Outstanding clicks outlive the effect too: portalUrl arriving mid-flight re-registers the
  // listeners, and the portal's reply must still find the click it answers.
  const pendingRef = useRef(new Map<string, PendingNavigation>())
  const [blockedHref, setBlockedHref] = useState<string | null>(null)

  const settle = useCallback(({ requestId, ok }: { requestId: string; ok: boolean }) => {
    const entry = pendingRef.current.get(requestId)
    if (!entry) return
    clearTimeout(entry.timer)
    pendingRef.current.delete(requestId)
    // The portal declined (app not installed for this viewer, not permitted) or never answered:
    // give the browser's default back so the user still gets the link, just in a new tab.
    if (!ok && !openInNewTab(entry.href)) setBlockedHref(entry.href)
  }, [])

  useEffect(() => {
    if (window.parent === window) return

    const origins = collectPortalOrigins(portalUrl)
    const portalOrigins = new Set(origins)

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
        settle({ requestId: result.requestId, ok: result.ok === true })
      }
    }

    const handleClick = (event: MouseEvent) => {
      if (!hostNavigatesRef.current || event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const target = event.target instanceof Element ? event.target : null
      const anchor = target?.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute(FALLBACK_ATTR)) return
      const link = parsePortalAppLink(anchor.href, origins)
      if (!link) return

      event.preventDefault()
      event.stopPropagation()
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const timer = setTimeout(() => settle({ requestId, ok: false }), NAVIGATE_REPLY_TIMEOUT_MS)
      pendingRef.current.set(requestId, { href: anchor.href, timer })
      postToPortal({ type: 'navigate', requestId, to: 'app', params: link })
    }

    window.addEventListener('message', handleMessage)
    document.addEventListener('click', handleClick, true)
    return () => {
      window.removeEventListener('message', handleMessage)
      document.removeEventListener('click', handleClick, true)
    }
  }, [portalUrl, settle])

  const dismissBlocked = useCallback(() => setBlockedHref(null), [])
  return { blockedHref, dismissBlocked }
}

// Only shown when the browser refused the new-tab fallback; a real click on the action is
// always allowed to open it. The anchor is tagged so the bridge leaves that click alone.
export const PortalLinkBridge = () => {
  const { blockedHref, dismissBlocked } = usePortalLinkBridge()
  const fallbackAttr = { [FALLBACK_ATTR]: true }
  return (
    <Snackbar
      open={blockedHref !== null}
      onClose={dismissBlocked}
      autoHideDuration={10000}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      message="Your browser blocked opening this link."
      action={
        blockedHref && (
          <Button
            href={blockedHref}
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            onClick={dismissBlocked}
            {...fallbackAttr}
          >
            Open link
          </Button>
        )
      }
    />
  )
}
