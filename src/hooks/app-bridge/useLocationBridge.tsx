'use client'

import { DASHBOARD_DOMAIN } from '@/constants/domains'
import { LocationChangedPayload, LocationNavigateMessage } from '@/hooks/app-bridge/types'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { ensureHttps } from '@/utils/https'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { toNavigateHref, toReportedLocation } from './location'
import { postMessageParentDashboard } from './utils'

const isParentOrigin = (origin: string, portalUrl?: string) =>
  DASHBOARD_DOMAIN.includes(origin) || (!!portalUrl && new URL(ensureHttps(portalUrl)).origin === origin)

// Mirrors the iframe's location into the portal URL so a task page can be linked to directly,
// and follows the portal when it navigates the open app (e.g. a notification link).
export const useLocationBridge = () => {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { workspace } = useSelector(selectAuthDetails)
  const portalUrl = workspace?.portalUrl
  const search = searchParams.toString()
  const token = searchParams.get('token')

  useEffect(() => {
    if (window.parent === window) return

    const payload: LocationChangedPayload = {
      type: 'location.changed',
      ...toReportedLocation(pathname, search),
    }
    postMessageParentDashboard(payload)
    if (portalUrl) {
      window.parent.postMessage(payload, ensureHttps(portalUrl))
    }
  }, [pathname, search, portalUrl])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || !isParentOrigin(event.origin, portalUrl)) return
      const data = event.data as Partial<LocationNavigateMessage> | undefined
      if (data?.type !== 'location.navigate' || typeof data.path !== 'string' || !data.path.startsWith('/')) return

      router.replace(toNavigateHref(data.path, typeof data.search === 'string' ? data.search : '', token))
    }

    addEventListener('message', handleMessage)
    return () => removeEventListener('message', handleMessage)
  }, [router, token, portalUrl])
}

export const LocationBridge = () => {
  useLocationBridge()
  return null
}
