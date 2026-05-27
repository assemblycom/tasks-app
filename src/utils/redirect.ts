import 'server-only'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { UserType } from '@/types/interfaces'
import { buildTokenQueryString, normalizeTokenParam } from '@/utils/tokenQuery'

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
    const token = normalizeTokenParam(searchParams.token)
    if (!token) return

    const queryParams: Record<string, string> = { isRedirect: '1' }
    if (commentId.data) queryParams.commentId = commentId.data
    if (fromNotificationCenter) queryParams.fromNotificationCenter = '1'

    const queryString = buildTokenQueryString(token, queryParams)
    if (commentId.data) {
      redirect(`/detail/${taskId.data}/${userType}?${queryString}`)
    }
    redirect(`/detail/${taskId.data}/${userType}?${queryString}`)
  }
}

export const RESOURCE_NOT_FOUND_REDIRECT_PATHS = {
  [UserType.INTERNAL_USER]: '/',
  [UserType.CLIENT_USER]: '/client',
}

export const redirectToClientPortal = (token: string) => {
  redirect(`/client?token=${token}`)
}
