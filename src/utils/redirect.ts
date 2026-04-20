import 'server-only'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { UserType } from '@/types/interfaces'

// Relative redirects only. An absolute redirect built from apiUrl (VERCEL_URL) would cross
// the iframe to the per-deployment hash origin (tasks-xxx.vercel.app) and off the stable
// alias the portal registered, causing the parent's origin allowlist to drop every
// app-bridge postMessage.
export const redirectIfTaskCta = (
  searchParams: Record<string, string>,
  userType: UserType,
  fromNotificationCenter: boolean = false,
) => {
  const taskId = z.string().safeParse(searchParams.taskId)
  const commentId = z.string().safeParse(searchParams.commentId)

  if (taskId.data) {
    const notificationCenterParam = fromNotificationCenter ? '&fromNotificationCenter=1' : ''
    const token = z.string().parse(searchParams.token)
    if (commentId.data) {
      redirect(
        `/detail/${taskId.data}/${userType}?token=${token}&commentId=${commentId.data}&isRedirect=1${notificationCenterParam}`,
      )
    }
    redirect(`/detail/${taskId.data}/${userType}?token=${token}&isRedirect=1${notificationCenterParam}`)
  }
}

export const RESOURCE_NOT_FOUND_REDIRECT_PATHS = {
  [UserType.INTERNAL_USER]: '/',
  [UserType.CLIENT_USER]: '/client',
}

export const redirectToClientPortal = (token: string) => {
  redirect(`/client?token=${token}`)
}
