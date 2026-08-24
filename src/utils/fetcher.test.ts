import { fetcher } from '@/utils/fetcher'

describe('fetcher', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('returns parsed JSON for successful responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [] }),
    })

    await expect(fetcher('/api/tasks/?token=test')).resolves.toEqual({ tasks: [] })
  })

  it('throws an error with status, url, and response body for failed responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal server error',
    })

    await expect(fetcher('/api/tasks/?token=test')).rejects.toThrow(
      'An error occurred while fetching the data. [500] /api/tasks/?token=test: Internal server error',
    )
  })

  it('returns undefined when url is null', async () => {
    await expect(fetcher(null)).resolves.toBeUndefined()
  })
})
