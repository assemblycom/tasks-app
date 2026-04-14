import { AssemblyBridge } from '@assembly-js/app-bridge'
import { Clickable } from '@/hooks/app-bridge/types'
import { useEffect } from 'react'

export const useSecondaryCta = (secondaryCta: Clickable | null) => {
  useEffect(() => {
    if (secondaryCta?.onClick) {
      AssemblyBridge.header.setSecondaryCta({
        label: secondaryCta.label,
        icon: secondaryCta.icon,
        onClick: secondaryCta.onClick,
      })
    } else {
      AssemblyBridge.header.setSecondaryCta(null)
    }
  }, [secondaryCta])
}
