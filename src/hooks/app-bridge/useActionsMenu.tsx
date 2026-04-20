import { ActionsMenuPayload, Clickable, Configurable } from '@/hooks/app-bridge/types'
import { useEffect, useMemo } from 'react'
import { postMessageParentDashboard } from './utils'
const getActionMenuItemId = (idx: number) => `header.actionsMenu.${idx}`

export function useActionsMenu(actions: Clickable[], config?: Configurable) {
  const callbackRefs = useMemo(() => {
    return actions.reduce<Record<string, () => void>>((acc, { onClick }, idx) => {
      if (onClick) acc[getActionMenuItemId(idx)] = onClick
      return acc
    }, {})
  }, [actions])

  useEffect(() => {
    const payload: ActionsMenuPayload = {
      type: 'header.actionsMenu',
      items: actions.map(({ label, onClick, icon, color }, idx) => ({
        onClick: onClick ? getActionMenuItemId(idx) : '',
        label,
        icon,
        color,
      })),
    }

    postMessageParentDashboard(payload, config?.portalUrl)

    const handleMessage = (event: MessageEvent) => {
      if (
        event.data.type === 'header.actionsMenu.onClick' &&
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
  }, [actions, callbackRefs, config?.portalUrl])

  useEffect(() => {
    const handleUnload = () => {
      const payload: ActionsMenuPayload = { type: 'header.actionsMenu', items: [] }
      postMessageParentDashboard(payload)
    }
    addEventListener('beforeunload', handleUnload)
    return () => {
      removeEventListener('beforeunload', handleUnload)
    }
  }, [])
}
