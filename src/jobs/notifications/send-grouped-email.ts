import 'server-only'

import { GroupedEmailContent } from '@/app/api/notification/groupedEmail.composer'
import { renderGroupedEmail } from '@/app/api/notification/groupedEmail.renderer'
import { NotificationRequestBody } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'

export type SendGroupedEmailArgs = {
  content: GroupedEmailContent
  senderId: string
  recipientClientId?: string | null
  recipientCompanyId?: string | null
  recipientInternalUserId?: string | null
  copilot: CopilotAPI
}

export const sendGroupedEmail = async ({
  content,
  senderId,
  recipientClientId,
  recipientCompanyId,
  recipientInternalUserId,
  copilot,
}: SendGroupedEmailArgs): Promise<string> => {
  const email = renderGroupedEmail(content)

  const payload: NotificationRequestBody = {
    senderId,
    senderType: 'internalUser',
    recipientClientId: recipientClientId ?? undefined,
    recipientCompanyId: recipientCompanyId ?? undefined,
    recipientInternalUserId: recipientInternalUserId ?? undefined,
    deliveryTargets: {
      email: {
        subject: email.subject,
        header: email.header,
        title: email.title,
        htmlBody: email.htmlBody,
      },
    },
  }

  const notification = await copilot.createNotification(payload)
  return notification.id
}
