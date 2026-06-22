import 'server-only'

import { ReminderEntry, renderGroupedReminderEmail } from '@/app/api/notification/groupedReminderEmail.renderer'
import { NotificationRequestBody } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'

export type SendGroupedReminderEmailArgs = {
  entries: ReminderEntry[]
  senderId: string
  recipientClientId: string
  recipientCompanyId: string | null
  copilot: CopilotAPI
}

export const sendGroupedReminderEmail = async ({
  entries,
  senderId,
  recipientClientId,
  recipientCompanyId,
  copilot,
}: SendGroupedReminderEmailArgs): Promise<string> => {
  const email = renderGroupedReminderEmail(entries)

  const payload: NotificationRequestBody = {
    senderId,
    senderType: 'internalUser',
    recipientClientId,
    recipientCompanyId: recipientCompanyId ?? undefined,
    deliveryTargets: {
      email: {
        subject: email.subject,
        header: email.header,
        title: email.title,
        body: email.body,
      },
    },
  }

  const notification = await copilot.createNotification(payload)
  return notification.id
}
