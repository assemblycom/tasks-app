'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export const ProgressLoad = () => {
  const pathname = usePathname()
  const isClientPath = pathname.includes('client')
  const [isNavigating, setIsNavigating] = useState(false)

  useEffect(() => {
    setIsNavigating(false)
  }, [pathname])

  useEffect(() => {
    if (isClientPath) return

    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return
      }

      const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return

      const nextUrl = new URL(anchor.href, window.location.href)
      if (nextUrl.origin !== window.location.origin) return
      if (nextUrl.pathname === window.location.pathname) return
      if (nextUrl.pathname.includes('client')) return

      setIsNavigating(true)
    }

    document.addEventListener('click', handleClick, { capture: true })
    return () => document.removeEventListener('click', handleClick, { capture: true })
  }, [isClientPath])

  if (isClientPath || !isNavigating) return null

  return (
    <>
      <style>
        {`#tasks-top-loader{pointer-events:none;position:fixed;z-index:1600;top:0;left:0;width:100%;height:4px;overflow:hidden}#tasks-top-loader .bar{height:100%;width:100%;background:#212B36;animation:tasks-top-loader 1s ease-in-out infinite;transform-origin:left center}@keyframes tasks-top-loader{0%{transform:scaleX(0);opacity:1}65%{transform:scaleX(.85);opacity:1}100%{transform:scaleX(1);opacity:0}}`}
      </style>
      <div id="tasks-top-loader" role="progressbar" aria-label="Loading page">
        <div className="bar" />
      </div>
    </>
  )
}
