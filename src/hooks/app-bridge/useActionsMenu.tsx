import { AssemblyBridge } from '@assembly-js/app-bridge'
import { Clickable } from '@/hooks/app-bridge/types'
import { useEffect } from 'react'

export function useActionsMenu(actions: Clickable[]) {
  useEffect(() => {
    AssemblyBridge.header.setActionsMenu(
      actions
        .filter((action) => action.onClick)
        .map(({ label, onClick, icon, color }) => ({
          label,
          onClick: onClick!,
          icon,
          ...(color ? { color: color as 'red' } : {}),
        })),
    )
  }, [actions])
}
