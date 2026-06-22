import { SilentError } from '@/components/templates/SilentError'
import { NotificationInProductCtaParamsSchema } from '@/types/common'
import { UserType } from '@/types/interfaces'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { redirectIfTaskCta } from '@/utils/redirect'
import { getSafeTokenPayload } from '@/utils/tokenPayload'
import z from 'zod'

async function getNotificationDetail(token: string) {
  const tokenPayload = await getSafeTokenPayload(token)
  const notificationId = z.string().safeParse(tokenPayload?.notificationId)
  if (!tokenPayload || !notificationId.success) return null

  const copilot = new CopilotAPI(token)
  return await copilot.getIUNotification(notificationId.data, tokenPayload.workspaceId)
}

export default async function NotificationCenter(props: { searchParams: Promise<{ token: string }> }) {
  const searchParams = await props.searchParams
  const token = searchParams.token
  if (!z.string().safeParse(token).success) {
    return <SilentError message="Please provide a Valid Token" />
  }

  const notificationDetail = await getNotificationDetail(token)
  if (!notificationDetail) return <SilentError message="Failed to get notification detail" />

  const params = NotificationInProductCtaParamsSchema.parse(notificationDetail.deliveryTargets?.inProduct?.ctaParams)

  redirectIfTaskCta({ ...params, ...searchParams }, UserType.INTERNAL_USER, true)

  // Silent Error is shown if redirect fails. Only possible reason for redirect to not work can be of the taskId not found
  return <SilentError message="TaskId is not found" />
}
