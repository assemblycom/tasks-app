import type { Token } from '@/types/common'

export const canFetchTaskTemplates = (tokenPayload: Pick<Token, 'internalUserId'>) => {
  return Boolean(tokenPayload.internalUserId)
}
