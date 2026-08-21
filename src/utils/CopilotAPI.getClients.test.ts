import { MAX_LIMIT_CLIENT_COUNT } from '@/constants/users'
import { ClientResponse } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'

const mockListClients = jest.fn()

jest.mock('copilot-node-sdk', () => ({
  copilotApi: () => ({
    listClients: mockListClients,
  }),
}))

jest.mock('@/app/api/core/utils/withRetry', () => ({
  withRetry: (fn: (...args: unknown[]) => unknown, args: unknown[]) => fn(...args),
  RETRY_404_ENABLED: false,
}))

const invalidStartingKeyError = new Error(
  'Failed to list clients: ValidationException: The provided starting key is invalid',
)

const buildClient = (id: string): ClientResponse => ({
  id,
  givenName: 'Test',
  familyName: 'Client',
  email: `${id}@example.com`,
  companyId: '00000000-0000-4000-8000-000000000001',
  status: 'active',
  avatarImageUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
})

describe('CopilotAPI#getClients pagination', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('retries without a stale nextToken for single-page requests', async () => {
    mockListClients
      .mockRejectedValueOnce(invalidStartingKeyError)
      .mockResolvedValueOnce({ data: [buildClient('client-1')] })

    const copilot = new CopilotAPI('token')
    const response = await copilot.getClients({ limit: 100, nextToken: 'stale-token' })

    expect(response.data).toEqual([buildClient('client-1')])
    expect(mockListClients).toHaveBeenCalledTimes(2)
    expect(mockListClients.mock.calls[0][0]).toEqual({ limit: 100, nextToken: 'stale-token' })
    expect(mockListClients.mock.calls[1][0]).toEqual({ limit: 100 })
  })

  it('retries batched pagination from the first page when a later page cursor is invalid', async () => {
    const firstPageClients = Array.from({ length: MAX_LIMIT_CLIENT_COUNT }, (_, index) =>
      buildClient(`client-${index}`),
    )
    const secondPageClients = [buildClient('client-next-page')]

    mockListClients
      .mockResolvedValueOnce({ data: firstPageClients, nextToken: 'page-2-token' })
      .mockRejectedValueOnce(invalidStartingKeyError)
      .mockResolvedValueOnce({ data: firstPageClients, nextToken: 'page-2-token' })
      .mockResolvedValueOnce({ data: secondPageClients })

    const copilot = new CopilotAPI('token')
    const response = await copilot.getClients({ limit: MAX_LIMIT_CLIENT_COUNT + 1 })

    expect(response.data).toHaveLength(MAX_LIMIT_CLIENT_COUNT + 1)
    expect(mockListClients).toHaveBeenCalledTimes(4)
    expect(mockListClients.mock.calls[2][0]).toEqual({
      limit: MAX_LIMIT_CLIENT_COUNT,
      nextToken: undefined,
    })
  })
})
