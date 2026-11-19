import { TokenSchema, ViewSettingUserIds } from '@/types/common'

describe('TokenSchema identity validation', () => {
  it('accepts IU tokens', () => {
    const result = TokenSchema.safeParse({
      workspaceId: 'ws-1',
      internalUserId: 'iu-1',
    })
    expect(result.success).toBe(true)
  })

  it('accepts client tokens with companyId', () => {
    const result = TokenSchema.safeParse({
      workspaceId: 'ws-1',
      clientId: 'client-1',
      companyId: 'company-1',
    })
    expect(result.success).toBe(true)
  })

  it('rejects workspace-only tokens', () => {
    const result = TokenSchema.safeParse({ workspaceId: 'ws-1' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().formErrors).toContain(
        'At least one of clientId, companyId, or internalUserId must be provided',
      )
    }
  })

  it('rejects clientId without companyId', () => {
    const result = TokenSchema.safeParse({
      workspaceId: 'ws-1',
      clientId: 'client-1',
    })
    expect(result.success).toBe(false)
  })
})

describe('ViewSettingUserIds', () => {
  it('rejects all-null user ids without throwing', () => {
    const result = ViewSettingUserIds.safeParse({
      internalUserId: null,
      clientId: null,
      companyId: null,
    })
    expect(result.success).toBe(false)
  })
})