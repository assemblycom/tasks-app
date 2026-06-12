import { Token } from '@/types/common'

export const shouldRedirectToClientPortal = (tokenPayload: Pick<Token, 'companyId'>) => {
  return !!tokenPayload.companyId
}
