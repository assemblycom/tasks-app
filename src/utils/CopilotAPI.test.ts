import { CopilotAPI } from '@/utils/CopilotAPI'

const mockListInternalUsers = jest.fn()

jest.mock('@/config', () => ({
  APP_ID: 'app-id',
  assemblyApiDomain: 'https://api.example.test',
  copilotAPIKey: 'api-key',
}))

jest.mock('@/app/api/core/utils/withRetry', () => ({
  withRetry: (fn: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => fn(...args),
}))

jest.mock('copilot-node-sdk', () => ({
  copilotApi: jest.fn(() => ({
    listInternalUsers: mockListInternalUsers,
  })),
}))

const makeInternalUser = (index: number) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  givenName: `Given ${index}`,
  familyName: `Family ${index}`,
  email: `user-${index}@example.com`,
  avatarImageUrl: undefined,
  isClientAccessLimited: false,
  companyAccessList: null,
  fallbackColor: null,
  createdAt: '2026-01-01T00:00:00.000Z',
})

const makeInternalUsers = ({ count, offset = 0 }: { count: number; offset?: number }) =>
  Array.from({ length: count }, (_, index) => makeInternalUser(offset + index + 1))

describe('CopilotAPI', () => {
  beforeEach(() => {
    mockListInternalUsers.mockReset()
  })

  describe('_getInternalUsers', () => {
    it('uses a single SDK request when the requested limit is within the API page size', async () => {
      const users = makeInternalUsers({ count: 2 })
      mockListInternalUsers.mockResolvedValueOnce({ data: users })

      const response = await new CopilotAPI('token')._getInternalUsers({ limit: 5_000, nextToken: 'cursor' })

      expect(response.data).toEqual(users)
      expect(mockListInternalUsers).toHaveBeenCalledTimes(1)
      expect(mockListInternalUsers).toHaveBeenCalledWith({ limit: 5_000, nextToken: 'cursor' })
    })

    it('splits oversized internal-user requests into bounded pages', async () => {
      const firstPage = makeInternalUsers({ count: 5_000 })
      const secondPage = makeInternalUsers({ count: 5_000, offset: 5_000 })
      const thirdPage = makeInternalUsers({ count: 2_000, offset: 10_000 })

      mockListInternalUsers
        .mockResolvedValueOnce({ data: firstPage, nextToken: 'cursor-1' })
        .mockResolvedValueOnce({ data: secondPage, nextToken: 'cursor-2' })
        .mockResolvedValueOnce({ data: thirdPage })

      const response = await new CopilotAPI('token')._getInternalUsers({ limit: 12_000 })

      expect(response.data).toHaveLength(12_000)
      expect(mockListInternalUsers).toHaveBeenNthCalledWith(1, { limit: 5_000, nextToken: undefined })
      expect(mockListInternalUsers).toHaveBeenNthCalledWith(2, { limit: 5_000, nextToken: 'cursor-1' })
      expect(mockListInternalUsers).toHaveBeenNthCalledWith(3, { limit: 2_000, nextToken: 'cursor-2' })
    })

    it('starts oversized requests from the provided next token', async () => {
      mockListInternalUsers
        .mockResolvedValueOnce({ data: makeInternalUsers({ count: 5_000 }), nextToken: 'cursor-2' })
        .mockResolvedValueOnce({ data: makeInternalUsers({ count: 2_000, offset: 5_000 }) })

      await new CopilotAPI('token')._getInternalUsers({ limit: 7_000, nextToken: 'cursor-1' })

      expect(mockListInternalUsers).toHaveBeenNthCalledWith(1, { limit: 5_000, nextToken: 'cursor-1' })
      expect(mockListInternalUsers).toHaveBeenNthCalledWith(2, { limit: 2_000, nextToken: 'cursor-2' })
    })
  })
})
