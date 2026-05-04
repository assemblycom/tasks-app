'use client'

import { setActiveTemplate } from '@/redux/features/templateSlice'
import store from '@/redux/store'
import { ITemplate } from '@/types/interfaces'
import { fetcher } from '@/utils/fetcher'
import { extractImgSrcs, replaceImgSrcs } from '@/utils/signedUrlReplacer'
import { useEffect } from 'react'
import useSWR from 'swr'

interface OneTemplateDataFetcherProps {
  template_id: string
  initialTemplate: ITemplate
}

export const OneTemplateDataFetcher = ({ template_id, initialTemplate }: OneTemplateDataFetcherProps) => {
  // Stable cache key — fetcher injects the live token at request time.
  const { data } = useSWR(`/api/tasks/templates/${template_id}`, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  })

  useEffect(() => {
    if (data?.data) {
      const newTemplate = structuredClone(data.data)
      if (initialTemplate?.body && newTemplate.body === undefined) {
        newTemplate.body = initialTemplate?.body
      }
      if (initialTemplate && initialTemplate.body && newTemplate.body) {
        const oldImgSrcs = extractImgSrcs(initialTemplate.body)
        const newImgSrcs = extractImgSrcs(newTemplate.body)
        if (oldImgSrcs.length > 0 && newImgSrcs.length > 0) {
          newTemplate.body = replaceImgSrcs(newTemplate.body, newImgSrcs, oldImgSrcs)
        }
      }
      store.dispatch(setActiveTemplate(newTemplate))
    }
  }, [data])

  return null
}
