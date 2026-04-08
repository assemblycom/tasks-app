import { AssemblyBridge } from '@assembly-js/app-bridge'
import { Clickable } from '@/hooks/app-bridge/types'
import { useEffect } from 'react'

export const usePrimaryCta = (primaryCta: Clickable | null) => {
  useEffect(() => {
    if (primaryCta?.onClick) {
      AssemblyBridge.header.setPrimaryCta({
        label: primaryCta.label,
        icon: primaryCta.icon,
        onClick: primaryCta.onClick,
      })
    } else {
      AssemblyBridge.header.setPrimaryCta(null)
    }
  }, [primaryCta])
}
