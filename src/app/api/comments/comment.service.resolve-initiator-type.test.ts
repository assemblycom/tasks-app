jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: jest.fn(() => ({})),
  },
}))
jest.mock('@/utils/CopilotAPI', () => ({ CopilotAPI: class {} }))

import { CommentService } from '@/app/api/comments/comment.service'
import User from '@api/core/models/User.model'
import { CommentInitiator } from '@prisma/client'

const INTERNAL_USER_ID = '11111111-1111-1111-1111-111111111111'
const CLIENT_ID = '22222222-2222-2222-2222-222222222222'
const UNKNOWN_ID = '33333333-3333-3333-3333-333333333333'

const createService = ({
  internalUserIds = [INTERNAL_USER_ID],
  clientIds = [CLIENT_ID],
  internalUserLookupFails = false,
}: {
  internalUserIds?: string[]
  clientIds?: string[]
  internalUserLookupFails?: boolean
} = {}) => {
  const user = new User('test-token', {
    workspaceId: 'workspace-1',
    internalUserId: INTERNAL_USER_ID,
  })

  const service = new CommentService(user)
  const mockCopilot = {
    getInternalUsers: jest.fn().mockResolvedValue({ data: internalUserIds.map((id) => ({ id })) }),
    getClients: jest.fn().mockResolvedValue({ data: clientIds.map((id) => ({ id })) }),
    getInternalUser: jest
      .fn()
      .mockImplementation(async (id: string) => (internalUserLookupFails ? Promise.reject(new Error('not found')) : { id })),
  }
  Object.assign(service, { copilot: mockCopilot })

  return { service, mockCopilot }
}

describe('CommentService#resolveCommentInitiatorTypes', () => {
  it('returns comments unchanged when initiatorType is already set', async () => {
    const { service, mockCopilot } = createService()
    const comments = [
      { id: 'comment-1', initiatorId: INTERNAL_USER_ID, initiatorType: CommentInitiator.internalUser },
    ]

    const result = await service.resolveCommentInitiatorTypes(comments)

    expect(result).toEqual(comments)
    expect(mockCopilot.getInternalUsers).not.toHaveBeenCalled()
  })

  it('resolves null initiatorType from internal user list', async () => {
    const { service } = createService()
    const comments = [{ id: 'comment-1', initiatorId: INTERNAL_USER_ID, initiatorType: null }]

    const result = await service.resolveCommentInitiatorTypes(comments)

    expect(result).toEqual([
      { id: 'comment-1', initiatorId: INTERNAL_USER_ID, initiatorType: CommentInitiator.internalUser },
    ])
  })

  it('resolves null initiatorType from client list', async () => {
    const { service } = createService()
    const comments = [{ id: 'comment-1', initiatorId: CLIENT_ID, initiatorType: null }]

    const result = await service.resolveCommentInitiatorTypes(comments)

    expect(result).toEqual([{ id: 'comment-1', initiatorId: CLIENT_ID, initiatorType: CommentInitiator.client }])
  })

  it('falls back to client when initiator is not in bulk lists and internal user lookup fails', async () => {
    const { service, mockCopilot } = createService({ internalUserIds: [], clientIds: [], internalUserLookupFails: true })
    const comments = [{ id: 'comment-1', initiatorId: UNKNOWN_ID, initiatorType: null }]

    const result = await service.resolveCommentInitiatorTypes(comments)

    expect(result).toEqual([{ id: 'comment-1', initiatorId: UNKNOWN_ID, initiatorType: CommentInitiator.client }])
    expect(mockCopilot.getInternalUser).toHaveBeenCalledWith(UNKNOWN_ID)
  })
})
