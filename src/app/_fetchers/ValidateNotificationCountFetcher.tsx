import { apiUrl, getCopilotAppId } from '@/config'
import { PropsWithToken } from '@/types/interfaces'

export const ValidateNotificationCountFetcher = async ({ token }: PropsWithToken) => {
  if (!getCopilotAppId()) {
    console.warn('Validate notifications skipped: Copilot app id is not configured')
    return <></>
  }

  try {
    await fetch(`${apiUrl}/api/notification/validate-count?token=${token}`)
  } catch (err) {
    console.error('Validate notifications failed :', err)
  }

  return <></>
}
