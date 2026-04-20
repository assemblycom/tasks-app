import { BreadcrumbsPayload, Clickable, Configurable } from '@/hooks/app-bridge/types'
import { ensureHttps } from '@/utils/https'
import { useEffect, useMemo } from 'react'
import { DASHBOARD_DOMAIN } from '@/constants/domains'
import { postMessageParentDashboard } from './utils'

const getBreadcrumbId = (idx: number) => `header.breadcrumbs.${idx}`

export const useBreadcrumbs = (breadcrumbs: Clickable[], config?: Configurable) => {
  const callbackRefs = useMemo(() => {
    return breadcrumbs.reduce<Record<string, () => void>>((acc, { onClick }, idx) => {
      if (onClick) acc[getBreadcrumbId(idx)] = onClick
      return acc
    }, {})
  }, [breadcrumbs])

  useEffect(() => {
    const payload: BreadcrumbsPayload = {
      type: 'header.breadcrumbs',
      items: breadcrumbs.map(({ label, onClick }, idx) => ({
        onClick: onClick ? getBreadcrumbId(idx) : '',
        label,
      })),
    }

    postMessageParentDashboard(payload)
    if (config?.portalUrl) {
      window.parent.postMessage(payload, ensureHttps(config.portalUrl))
    }

    const handleMessage = (event: MessageEvent) => {
      if (
        event.data.type === 'header.breadcrumbs.onClick' &&
        typeof event.data.id === 'string' &&
        callbackRefs[event.data.id]
      ) {
        callbackRefs[event.data.id]()
      }
    }

    addEventListener('message', handleMessage)

    return () => {
      removeEventListener('message', handleMessage)
    }
  }, [breadcrumbs, callbackRefs, config?.portalUrl])
}
