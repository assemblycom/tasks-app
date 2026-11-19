import { UserRole } from '@/app/api/core/types/user'
import { Token } from '@/types/common'

export const validMockTokens: { [_k in UserRole]: string } & { workspaceOnly: string } = {
  internalUser: 'iu-token',
  client: 'client-token',
  workspaceOnly: 'workspace-only-token',
}

const mockInternalUserTokenPayload: Token = {
  internalUserId: 'internalUserId',
  workspaceId: 'workspaceId',
}

const mockClientTokenPayload: Token = {
  clientId: 'clientId',
  companyId: 'companyId',
  workspaceId: 'workspaceId',
}

const mockWorkspaceOnlyTokenPayload: Token = {
  workspaceId: 'workspaceId',
}

export const mockTokenPayloads = {
  internalUser: mockInternalUserTokenPayload,
  client: mockClientTokenPayload,
  workspaceOnly: mockWorkspaceOnlyTokenPayload,
}
