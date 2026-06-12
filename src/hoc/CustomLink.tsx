'use client'
import Link from 'next/link'
import { CSSProperties, ReactNode, useCallback, useRef, useState } from 'react'
import { UrlObject } from 'url'
import { buildTokenQueryString } from '@/utils/tokenQuery'
import { z } from 'zod'

export const CustomLink = ({
  children,
  href,
  style,
  draggable = true,
}: {
  children: ReactNode
  href: string | UrlObject
  style?: CSSProperties
  draggable?: boolean
}) => {
  type UrlDetails = {
    pathname?: string
    token?: string
  }

  const getUrl = useCallback((): UrlDetails => {
    if (typeof href !== 'string') {
      if ('pathname' in href && 'query' in href && href.query && typeof href.query === 'object') {
        const pathname = z.string().parse(href.pathname)
        const token = z.string().parse(href.query['token'])
        return { pathname, token }
      } else {
        console.error('Invalid UrlObject format')
        return {}
      }
    }
    return { pathname: href }
  }, [href])

  const { pathname, token } = getUrl()
  const linkHref = token && pathname ? `${pathname}?${buildTokenQueryString(token)}` : (pathname ?? '')

  const [shouldPrefetch, setShouldPrefetch] = useState(false)
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleMouseEnter = useCallback(() => {
    hoverTimeoutRef.current = setTimeout(() => {
      setShouldPrefetch(true)
    }, 500) //500 ms delay is introduced to keep it safe from [ApiError]: Generic Error: status: 429; status text: ; body: "code": "rate_limit_exceeded", "message": "Rate limit exceeded."}
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
  }, [])

  return (
    <Link
      href={linkHref}
      style={{
        ...style,
        outline: 'none',
        boxShadow: 'none',
      }}
      prefetch={shouldPrefetch}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) {
          e.preventDefault()
        }
      }}
    >
      {children}
    </Link>
  )
}
