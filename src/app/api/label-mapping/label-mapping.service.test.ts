const mockLabelFindFirst = jest.fn()
const mockLabelDelete = jest.fn()

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      label: { findFirst: mockLabelFindFirst, delete: mockLabelDelete },
    }),
  },
}))

jest.mock('@/utils/CopilotAPI', () => ({ CopilotAPI: jest.fn() }))

import { LabelMappingService } from '@api/label-mapping/label-mapping.service'
import User from '@api/core/models/User.model'
import { UserRole } from '@api/core/types/user'

const user = {
  workspaceId: 'ws-1',
  role: UserRole.IU,
  internalUserId: 'iu-1',
  token: 'token',
} as unknown as User

describe('LabelMappingService#deleteLabel', () => {
  beforeEach(() => jest.clearAllMocks())

  it('deletes the matching label row', async () => {
    mockLabelFindFirst.mockResolvedValue({ id: 'label-1' })

    await new LabelMappingService(user).deleteLabel('ASS10-009')

    expect(mockLabelDelete).toHaveBeenCalledWith({ where: { id: 'label-1' } })
  })

  it('no-ops when the label row is already gone', async () => {
    mockLabelFindFirst.mockResolvedValue(null)

    await new LabelMappingService(user).deleteLabel('ASS10-009')

    expect(mockLabelDelete).not.toHaveBeenCalled()
  })
})
