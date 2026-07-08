import 'server-only'

import { GroupedEmailContent } from '@/app/api/notification/groupedEmail.composer'
import { renderGroupedEmail } from '@/app/api/notification/groupedEmail.renderer'
import { NotificationRequestBody, NotificationSender } from '@/types/common'
import { isMessagableError } from '@/utils/copilotError'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { logger } from '@trigger.dev/sdk/v3'

export type SendGroupedEmailArgs = {
  content: GroupedEmailContent
  senderId: string
  // Copilot rejects an IU-recipient email whose sender identity is inconsistent, so the summary must
  // carry the real actor's type/company (a client can be the actor, e.g. completing their own task).
  senderType?: NotificationSender
  senderCompanyId?: string
  recipientClientId?: string | null
  recipientCompanyId?: string | null
  recipientInternalUserId?: string | null
  // Set only for a single-category IU window so the platform can gate this summary per the IU's
  // preference. A mixed-category window carries no id (can't gate against one setting).
  notificationSettingId?: string
  copilot: CopilotAPI
}

export const sendGroupedEmail = async ({
  content,
  senderId,
  senderType,
  senderCompanyId,
  recipientClientId,
  recipientCompanyId,
  recipientInternalUserId,
  notificationSettingId,
  copilot,
}: SendGroupedEmailArgs): Promise<string | undefined> => {
  const email = renderGroupedEmail(content)

  const payload: NotificationRequestBody = {
    senderId,
    senderType: senderType ?? 'internalUser',
    senderCompanyId,
    recipientClientId: recipientClientId ?? undefined,
    recipientCompanyId: recipientCompanyId ?? undefined,
    recipientInternalUserId: recipientInternalUserId ?? undefined,
    notificationSettingId,
    deliveryTargets: {
      email: {
        subject: email.subject,
        header: email.header,
        title: email.title,
        htmlBody: email.htmlBody,
      },
    },
  }

  logger.log('flush-grouped-email: createNotification payload (grouped summary)', { payload })
  try {
    const notification = await copilot.createNotification(payload)
    return notification?.id
  } catch (e: unknown) {
    // Account for workspaces without multi-companies, which reject senderCompanyId (mirrors NotificationService).
    if (isMessagableError(e) && e.body?.message === 'sender company ID is invalid based on sender') {
      const notification = await copilot.createNotification({ ...payload, senderCompanyId: undefined })
      return notification?.id
    }
    throw e
  }
}
