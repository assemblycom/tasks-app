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

  it('throws an error with status, path, and response body, without the token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal server error',
    })

    await expect(fetcher('/api/tasks/?token=secret-token')).rejects.toThrow(
      'An error occurred while fetching the data. [500] /api/tasks/: Internal server error',
    )
  })

  it('attaches the response status to the error so onErrorRetry can skip 404s', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '',
    })

    await expect(fetcher('/api/tasks/?token=test')).rejects.toMatchObject({ status: 404 })
  })

  it('returns undefined when url is null', async () => {
    await expect(fetcher(null)).resolves.toBeUndefined()
  })
})
