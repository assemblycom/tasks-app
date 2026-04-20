import { Clickable, Configurable, SecondaryCtaPayload } from '@/hooks/app-bridge/types'
import { useEffect } from 'react'
import { postMessageParentDashboard } from './utils'

export const useSecondaryCta = (secondaryCta: Clickable | null, config?: Configurable) => {
  useEffect(() => {
    const payload: SecondaryCtaPayload | Pick<SecondaryCtaPayload, 'type'> = !secondaryCta
      ? { type: 'header.secondaryCta' }
      : {
          type: 'header.secondaryCta',
          label: secondaryCta.label,
          icon: secondaryCta.icon,
          onClick: 'header.secondaryCta.onClick',
        }

    postMessageParentDashboard(payload, config?.portalUrl)

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'header.secondaryCta.onClick' && typeof event.data.id === 'string' && secondaryCta?.onClick) {
        secondaryCta.onClick()
      }
    }

    addEventListener('message', handleMessage)

    return () => {
      removeEventListener('message', handleMessage)
    }
  }, [secondaryCta, config?.portalUrl])

  useEffect(() => {
    const handleUnload = () => {
      postMessageParentDashboard({ type: 'header.secondaryCta' }, config?.portalUrl)
    }
    addEventListener('beforeunload', handleUnload)
    return () => {
      removeEventListener('beforeunload', handleUnload)
    }
  }, [config?.portalUrl])
}
