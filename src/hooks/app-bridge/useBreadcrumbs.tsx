import { AssemblyBridge } from '@assembly-js/app-bridge'
import { Clickable } from '@/hooks/app-bridge/types'
import { useEffect } from 'react'

export const useBreadcrumbs = (breadcrumbs: Clickable[]) => {
  useEffect(() => {
    AssemblyBridge.header.setBreadcrumbs(
      breadcrumbs.map(({ label, onClick }) => ({
        label,
        onClick,
      })),
    )
  }, [breadcrumbs])
}
