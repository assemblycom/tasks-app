'use client'

import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { selectTaskDetails } from '@/redux/features/taskDetailsSlice'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { usePathname, useRouter } from 'next/navigation'

const EscapeHandler = () => {
  const router = useRouter()
  const pathname = usePathname()
  const { activeTask, accessibleTasks, token } = useSelector(selectTaskBoard)
  const { fromNotificationCenter } = useSelector(selectTaskDetails)

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      if (document.querySelector('.tippy-box')) {
        return
      }

      // Don't navigate when embedded in notification center view
      if (fromNotificationCenter) return

      // Task detail page: navigate to parent task or board
      if (pathname.includes('/detail/')) {
        const isClientUser = pathname.includes('/cu')
        const isAccessibleSubtask = activeTask?.parentId && accessibleTasks.some((task) => task.id === activeTask.parentId)

        if (isClientUser) {
          router.push(isAccessibleSubtask ? `/detail/${activeTask.parentId}/cu?token=${token}` : `/client?token=${token}`)
        } else {
          router.push(isAccessibleSubtask ? `/detail/${activeTask.parentId}/iu/?token=${token}` : `/?token=${token}`)
        }
        return
      }

      // Template detail page: navigate back to templates list
      if (pathname.includes('/manage-templates/')) {
        router.push(`/manage-templates?token=${token}`)
        return
      }

      // Fallback for any other page
      router.back()
    }

    window.addEventListener('keydown', handleEsc)

    return () => {
      window.removeEventListener('keydown', handleEsc)
    }
  }, [router, pathname, activeTask, accessibleTasks, token, fromNotificationCenter])

  return null
}

export default EscapeHandler
