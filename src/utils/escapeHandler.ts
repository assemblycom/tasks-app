'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const EscapeHandler = () => {
  const router = useRouter()

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (document.querySelector('.tippy-box')) {
        return
      }

      if (event.key === 'Escape') {
        router.back()
      }
    }

    window.addEventListener('keydown', handleEsc)

    return () => {
      window.removeEventListener('keydown', handleEsc)
    }
  }, [router])

  return null
}

export default EscapeHandler
