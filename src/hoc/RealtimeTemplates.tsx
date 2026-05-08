'use client'

import { RealtimeTemplatesHandler } from '@/lib/realtimeTemplates'
import { supabase } from '@/lib/supabase'
import { selectCreateTemplate, setActiveTemplate, setTemplates } from '@/redux/features/templateSlice'
import store from '@/redux/store'
import { Token } from '@/types/common'
import { ITemplate } from '@/types/interfaces'
import { getFormattedTemplate } from '@/utils/getFormattedRealTimeData'
import { isTemplatePayloadEqual } from '@/utils/isRealtimePayloadEqual'
import { extractImgSrcs, replaceImgSrcs } from '@/utils/signedUrlReplacer'
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useEffect } from 'react'
import { useSelector } from 'react-redux'

export interface RealTimeTemplateResponse extends ITemplate {
  deletedAt: string
}

export const RealTimeTemplates = ({
  children,
  task,
  tokenPayload,
  token,
}: {
  children: ReactNode
  task?: ITemplate
  tokenPayload: Token
  token: string
}) => {
  const { templates = [] } = useSelector(selectCreateTemplate)

  const pathname = usePathname()
  const router = useRouter()

  const redirectBack = (updatedTemplate: RealTimeTemplateResponse) => {
    //disable board navigation if not in template details page
    if (!pathname.includes(`manage-templates/${updatedTemplate.id}`)) return

    router.push(
      updatedTemplate?.parentId
        ? `/manage-templates/${updatedTemplate.parentId}?token=${token}`
        : `/configure-tasks-app?token=${token}`,
    )
  }

  const handleTemplatesRealTimeUpdates = (payload: RealtimePostgresChangesPayload<RealTimeTemplateResponse>) => {
    if (isTemplatePayloadEqual(payload)) {
      return //no changes for the same payload
    }

    const realtimeHandler = new RealtimeTemplatesHandler(payload, redirectBack, tokenPayload)
    const isSubTemplate =
      Object.keys(payload.new).includes('parentId') && (payload.new as RealTimeTemplateResponse).parentId !== null

    if (isSubTemplate) {
      return realtimeHandler.handleRealtimeSubTemplates()
    }

    if (payload.eventType === 'INSERT') {
      return realtimeHandler.handleRealtimeTemplateInsert()
    }
    if (payload.eventType === 'UPDATE') {
      return realtimeHandler.handleRealtimeTemplateUpdate()
    }

    console.error('Unknown event type for realtime handler')
  }

  useEffect(() => {
    if (!tokenPayload.internalUserId) {
      return
    }
    const channel = supabase
      .channel('realtime templates')
      .on(
        'postgres_changes',
        // Because of the way supabase realtime is architected for postgres_changes, it can only apply one filter at a time.
        // Ref: https://github.com/supabase/realtime-js/issues/97
        {
          event: '*',
          schema: 'public',
          table: 'TaskTemplates',
          filter: `workspaceId=eq.${tokenPayload.workspaceId}`,
        },
        handleTemplatesRealTimeUpdates,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, templates])

  return children
}
