import { MessagableError } from '@/types/CopilotApiError'

export const NO_COMPANY_CLIENTS_MESSAGE_CHANNEL = 'No clients for company to create message channel'

export const isMessagableError = (e: unknown): e is MessagableError => {
  return (
    typeof e === 'object' && e !== null && 'message' in e && (!('body' in e) || typeof (e as any).body?.message === 'string')
  )
}

export const isNoCompanyClientsMessageChannelError = (e: unknown): boolean =>
  isMessagableError(e) &&
  (e.body?.message === NO_COMPANY_CLIENTS_MESSAGE_CHANNEL || e.message.includes('No client users found for company'))

export const isSenderCompanyIdInvalidError = (e: unknown): boolean =>
  isMessagableError(e) && e.body?.message === 'sender company ID is invalid based on sender'
