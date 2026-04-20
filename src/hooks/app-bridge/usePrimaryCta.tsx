import { Clickable, Configurable, PrimaryCtaPayload } from '@/hooks/app-bridge/types'
import { useEffect } from 'react'
import { postMessageParentDashboard } from './utils'

export const usePrimaryCta = (primaryCta: Clickable | null, config?: Configurable) => {
  useEffect(() => {
    const payload: PrimaryCtaPayload | Pick<PrimaryCtaPayload, 'type'> = !primaryCta
      ? { type: 'header.primaryCta' }
      : {
          icon: primaryCta.icon,
          label: primaryCta.label,
          onClick: 'header.primaryCta.onClick',
          type: 'header.primaryCta',
        }

    postMessageParentDashboard(payload, config?.portalUrl)

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'header.primaryCta.onClick' && typeof event.data.id === 'string' && primaryCta?.onClick) {
        primaryCta.onClick()
      }
    }

    addEventListener('message', handleMessage)

    return () => {
      removeEventListener('message', handleMessage)
    }
  }, [primaryCta, config?.portalUrl])

  useEffect(() => {
    const handleUnload = () => {
      postMessageParentDashboard({ type: 'header.primaryCta' }, config?.portalUrl)
    }
    addEventListener('beforeunload', handleUnload)
    return () => {
      removeEventListener('beforeunload', handleUnload)
    }
  }, [config?.portalUrl])
}
