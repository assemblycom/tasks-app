import { SilentError } from '@/components/templates/SilentError'
import { NotificationInProductCtaParamsSchema } from '@/types/common'
import { UserType } from '@/types/interfaces'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { getEmbedTokenPayload } from '@/utils/embedTokenAuth'
import { normalizeTokenParam } from '@/utils/tokenQuery'
import { redirectIfTaskCta } from '@/utils/redirect'
import z from 'zod'

async function getNotificationDetail(token: string) {
  const tokenPayload = await getEmbedTokenPayload(token)
  if (!tokenPayload?.notificationId) return null

  const copilot = new CopilotAPI(token)
  return await copilot.getIUNotification(z.string().parse(tokenPayload.notificationId), tokenPayload.workspaceId)
}

export default async function NotificationCenter(props: { searchParams: Promise<{ token: string }> }) {
  const searchParams = await props.searchParams
  const token = normalizeTokenParam(searchParams.token)
  if (!token) {
    return <SilentError message="Please provide a Valid Token" />
  }

  const notificationDetail = await getNotificationDetail(token)
  if (!notificationDetail) return <SilentError message="Failed to get notification detail" />

  const params = NotificationInProductCtaParamsSchema.parse(notificationDetail.deliveryTargets?.inProduct?.ctaParams)

  redirectIfTaskCta({ ...params, ...searchParams }, UserType.INTERNAL_USER, true)

  // Silent Error is shown if redirect fails. Only possible reason for redirect to not work can be of the taskId not found
  return <SilentError message="TaskId is not found" />
}
