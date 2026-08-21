import 'server-only'

import { ReminderEntry, renderGroupedReminderEmail } from '@/app/api/notification/groupedReminderEmail.renderer'
import { NotificationRequestBody } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { logger } from '@trigger.dev/sdk/v3'

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
}: SendGroupedReminderEmailArgs): Promise<string | null> => {
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
        htmlBody: email.htmlBody,
      },
    },
  }

  const notification = await copilot.createNotification(payload)
  if (!notification) {
    logger.warn('sendGroupedReminderEmail: notification suppressed by platform; keeping ledger for dedupe', {
      recipientClientId,
      recipientCompanyId,
      entryCount: entries.length,
    })
    return null
  }
  return notification.id
}
