import { fetchWithErrorHandler } from '@/app/_fetchers/fetchWithErrorHandler'

describe('fetchWithErrorHandler', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  it('returns parsed JSON responses', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(fetchWithErrorHandler<{ ok: boolean }>('https://example.test/api?token=secret')).resolves.toEqual({
      ok: true,
    })
  })

  it('reports non-JSON success responses with a redacted URL', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response('An error occurred while rendering', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    await expect(fetchWithErrorHandler('https://example.test/api?token=secret', undefined, 0)).rejects.toThrow(
      'Expected JSON response from https://example.test/api?token=[redacted] but received text/plain (200): An error occurred while rendering',
    )
  })

  it('reports non-OK responses with a redacted URL and body preview', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response('An error occurred during retry for token=secret', {
        status: 500,
        headers: { 'content-type': 'text/plain' },
      }),
    )

    await expect(fetchWithErrorHandler('https://example.test/api?token=secret', undefined, 0)).rejects.toThrow(
      'Fetch failed (500) for https://example.test/api?token=[redacted]: An error occurred during retry for token=[redacted]',
    )
  })
})
