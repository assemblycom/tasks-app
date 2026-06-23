import { canFetchTaskTemplates } from '@/utils/taskTemplatesAccess'
import type { Token } from '@/types/common'

describe('canFetchTaskTemplates', () => {
  it('allows internal users to fetch task templates', () => {
    expect(canFetchTaskTemplates({ internalUserId: 'iu_1' })).toBe(true)
  })

  it('allows preview tokens because they include an internal user id', () => {
    const previewTokenPayload: Token = {
      internalUserId: 'iu_1',
      clientId: 'client_1',
      workspaceId: 'workspace_1',
    }

    expect(canFetchTaskTemplates(previewTokenPayload)).toBe(true)
  })

  it('prevents normal client tokens from fetching task templates', () => {
    expect(canFetchTaskTemplates({ internalUserId: undefined })).toBe(false)
  })
})
