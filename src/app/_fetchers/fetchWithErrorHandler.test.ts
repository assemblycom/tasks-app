import { fetchWithErrorHandler } from '@/app/_fetchers/fetchWithErrorHandler'

describe('fetchWithErrorHandler', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('throws a clear error when the response body is empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    })

    await expect(fetchWithErrorHandler('https://example.com/api', undefined, 0)).rejects.toThrow('Empty API response')
  })

  it('throws a clear error when the response body is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'Internal Server Error',
    })

    await expect(fetchWithErrorHandler('https://example.com/api', undefined, 0)).rejects.toThrow('Invalid JSON response')
  })

  it('parses valid JSON responses', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"tasks":[]}',
    })

    await expect(fetchWithErrorHandler<{ tasks: unknown[] }>('https://example.com/api', undefined, 0)).resolves.toEqual({
      tasks: [],
    })
  })
})
