const mockListCompanies = jest.fn()
const mockCopilotApi = jest.fn((_args: unknown) => ({
  listCompanies: mockListCompanies,
}))

jest.mock('@/config', () => ({
  copilotAPIKey: 'test-api-key',
  APP_ID: 'test-app-id',
  assemblyApiDomain: 'https://api.example.test',
}))

jest.mock('copilot-node-sdk', () => ({
  copilotApi: (args: unknown) => mockCopilotApi(args),
}))

jest.mock('@/app/api/core/utils/withRetry', () => ({
  withRetry: <T>(fn: (...args: unknown[]) => Promise<T>, args: unknown[]) => fn(...args),
}))

import { CopilotAPI } from './CopilotAPI'

const buildCompany = (id: string) => ({
  id,
  name: `Company ${id}`,
  iconImageUrl: null,
  createdAt: '2026-01-01T00:00:00.000Z',
})

const buildCompanies = ({ count, prefix }: { count: number; prefix: string }) =>
  Array.from({ length: count }, (_, index) => buildCompany(`${prefix}-${index}`))

describe('CopilotAPI getCompanies', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('delegates directly when the requested limit fits in one Copilot page', async () => {
    const response = { data: [buildCompany('company-1')] }
    mockListCompanies.mockResolvedValueOnce(response)

    const copilot = new CopilotAPI('token')
    const result = await copilot.getCompanies({ limit: 100, isPlaceholder: false })

    expect(result).toEqual(response)
    expect(mockListCompanies).toHaveBeenCalledTimes(1)
    expect(mockListCompanies).toHaveBeenCalledWith({ limit: 100, isPlaceholder: false })
  })

  it('fetches companies in Copilot-sized pages when requesting more than one page', async () => {
    const firstPage = buildCompanies({ count: 5_000, prefix: 'first' })
    const secondPage = buildCompanies({ count: 1_000, prefix: 'second' })

    mockListCompanies
      .mockResolvedValueOnce({ data: firstPage, nextToken: 'next-page' })
      .mockResolvedValueOnce({ data: secondPage, nextToken: 'unused-page' })

    const copilot = new CopilotAPI('token')
    const result = await copilot.getCompanies({ limit: 6_000, isPlaceholder: false })

    expect(result.data).toHaveLength(6_000)
    expect(result.data).toEqual([...firstPage, ...secondPage])
    expect(mockListCompanies).toHaveBeenCalledTimes(2)
    expect(mockListCompanies).toHaveBeenNthCalledWith(1, {
      limit: 5_000,
      isPlaceholder: false,
      nextToken: undefined,
    })
    expect(mockListCompanies).toHaveBeenNthCalledWith(2, {
      limit: 1_000,
      isPlaceholder: false,
      nextToken: 'next-page',
    })
  })
})
