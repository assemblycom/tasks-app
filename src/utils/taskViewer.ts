import { Token } from '@/types/common'
import { Associations } from '@/types/dto/tasks.dto'
import { getPreviewMode } from './previewMode'

export const checkIfTaskViewer = (associations: Associations, tokenPayload: Token | undefined): boolean => {
  return (
    Array.isArray(associations) &&
    associations.length > 0 &&
    (!associations[0].clientId || associations[0].clientId === tokenPayload?.clientId) &&
    associations[0].companyId === tokenPayload?.companyId &&
    !getPreviewMode(tokenPayload)
  )
}
