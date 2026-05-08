'use client'

import { Clickable, Icons } from '@/hooks/app-bridge/types'
import { useActionsMenu } from '@/hooks/app-bridge/useActionsMenu'
import { useAwake } from '@/hooks/app-bridge/useAwake'
import { useBreadcrumbs } from '@/hooks/app-bridge/useBreadcrumbs'
import { usePrimaryCta } from '@/hooks/app-bridge/usePrimaryCta'
import { setShowConfirmDeleteModal } from '@/redux/features/taskDetailsSlice'
import { setCreateTemplateFields, setTargetTemplateId } from '@/redux/features/templateSlice'
import store from '@/redux/store'
import { ITemplate } from '@/types/interfaces'
import { useCallback, useEffect, useState } from 'react'

interface ManageTemplateDetailsAppBridgeProps {
  portalUrl?: string
  template: ITemplate
}

export const ManageTemplateDetailsAppBridge = ({ portalUrl, template }: ManageTemplateDetailsAppBridgeProps) => {
  const awake = useAwake()

  const handleDeleteTemplate = useCallback(() => {
    store.dispatch(setShowConfirmDeleteModal())
    store.dispatch(setTargetTemplateId(template.id))
    store.dispatch(setCreateTemplateFields({ targetField: 'taskName', value: template.title }))
    // "awaken" callback using one more render to avoid hydration issues
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awake])

  const items: Clickable[] = [
    {
      label: 'Delete template',
      icon: Icons.TRASH,
      onClick: handleDeleteTemplate,
    },
  ]
  usePrimaryCta(null, { portalUrl })
  useActionsMenu(items, { portalUrl })

  return <></>
}
