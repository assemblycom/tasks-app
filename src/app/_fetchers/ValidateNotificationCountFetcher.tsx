import { Uuid } from '@/types/common'
import User from '@api/core/models/User.model'
import { ValidateCountService } from '@api/notification/validate-count/validateCount.service'

export const ValidateNotificationCountFetcher = async ({ user }: { user: User }) => {
  const clientId = Uuid.safeParse(user.clientId)
  const companyId = Uuid.safeParse(user.companyId)
  if (!clientId.success || !companyId.success) return <></>

  try {
    await new ValidateCountService(user).fixClientNotificationCount(clientId.data, companyId.data, user.workspaceId)
  } catch (err) {
    console.error('Validate notifications failed :', err)
  }

  return <></>
}
