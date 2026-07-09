import { NotificationRequestBody } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'

export const resolveRecipientCompanyId = async ({
  copilot,
  recipientClientId,
  recipientCompanyId,
}: {
  copilot: CopilotAPI
  recipientClientId: string
  recipientCompanyId?: string | null
}): Promise<string> => {
  if (recipientCompanyId) return recipientCompanyId

  const client = await copilot.getClient(recipientClientId)
  return client.companyId
}

export const resolveClientRecipient = async ({
  copilot,
  payload,
  recipientCompanyId,
}: {
  copilot: CopilotAPI
  payload: NotificationRequestBody
  recipientCompanyId?: string | null
}): Promise<NotificationRequestBody> => {
  if (!payload.recipientClientId || payload.recipientCompanyId) return payload

  return {
    ...payload,
    recipientCompanyId: await resolveRecipientCompanyId({
      copilot,
      recipientClientId: payload.recipientClientId,
      recipientCompanyId,
    }),
  }
}
