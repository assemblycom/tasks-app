import { SilentError } from '@/components/templates/SilentError'
import { NotificationInProductCtaParamsSchema } from '@/types/common'
import { UserType } from '@/types/interfaces'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { redirectIfTaskCta } from '@/utils/redirect'
import z from 'zod'

async function getNotificationDetail(token: string) {
  const copilot = new CopilotAPI(token)
  const tokenPayload = await copilot.getTokenPayload()

  if (!tokenPayload?.notificationId) return null

  return await copilot.getIUNotification(tokenPayload.notificationId, tokenPayload.workspaceId)
}

export default async function NotificationCenter(props: { searchParams: Promise<{ token: string }> }) {
  const searchParams = await props.searchParams
  const token = searchParams.token
  if (!z.string().safeParse(token).success) {
    return <SilentError message="Please provide a Valid Token" />
  }

  let notificationDetail
  try {
    notificationDetail = await getNotificationDetail(token)
  } catch (error) {
    console.warn('notification-center: failed to load notification', error)
    return <SilentError message="This notification could not be opened in Tasks" />
  }

  if (!notificationDetail) return <SilentError message="Failed to get notification detail" />

  const params = NotificationInProductCtaParamsSchema.safeParse(
    notificationDetail.deliveryTargets?.inProduct?.ctaParams,
  )
  if (!params.success) {
    return <SilentError message="This notification is not linked to a task" />
  }

  redirectIfTaskCta({ ...params.data, ...searchParams }, UserType.INTERNAL_USER, true)

  return <SilentError message="TaskId is not found" />
}
