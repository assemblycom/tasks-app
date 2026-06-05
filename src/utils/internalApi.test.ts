jest.mock('@/config', () => ({
  apiUrl: 'https://fallback.example.com',
}))

jest.mock('next/headers', () => ({
  headers: jest.fn(),
}))

import { assertOkResponse, getOriginFromHeaderReader, parseJsonResponse } from '@/utils/internalApi'

const headerReader = (headers: Record<string, string>) => ({
  get: (name: string) => headers[name.toLowerCase()] ?? null,
})

describe('internalApi utils', () => {
  describe('getOriginFromHeaderReader', () => {
    it('uses the forwarded host and protocol from the current request', () => {
      const origin = getOriginFromHeaderReader(
        headerReader({
          'x-forwarded-host': 'tasks-app-sand.vercel.app',
          'x-forwarded-proto': 'https',
          host: 'tasks.assembly.com',
        }),
      )

      expect(origin).toBe('https://tasks-app-sand.vercel.app')
    })

    it('falls back to the host header with https for remote hosts', () => {
      const origin = getOriginFromHeaderReader(headerReader({ host: 'tasks.assembly.com' }))

      expect(origin).toBe('https://tasks.assembly.com')
    })

    it('uses http for localhost fallback hosts', () => {
      const host = ['local', 'host:3000'].join('')
      const origin = getOriginFromHeaderReader(headerReader({ host }))

      expect(origin).toBe(`http://${host}`)
    })

    it('uses the configured fallback when the request has no host', () => {
      const origin = getOriginFromHeaderReader(headerReader({}))

      expect(origin).toBe('https://fallback.example.com')
    })
  })

  describe('parseJsonResponse', () => {
    it('returns parsed JSON for successful JSON responses', async () => {
      const result = await parseJsonResponse<{ comment: { id: string } }>(
        new Response(JSON.stringify({ comment: { id: 'comment-id' } }), { status: 201 }),
        'Create comment',
      )

      expect(result.comment.id).toBe('comment-id')
    })

    it('throws an actionable error for failed text responses', async () => {
      await expect(
        parseJsonResponse(
          new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }),
          'Create comment',
        ),
      ).rejects.toThrow('Create comment failed (500 Internal Server Error): Internal Server Error')
    })

    it('throws an actionable error for successful non-JSON responses', async () => {
      await expect(
        parseJsonResponse(new Response('Internal Server Error', { status: 200 }), 'Create comment'),
      ).rejects.toThrow('Create comment returned a non-JSON response (200 ): Internal Server Error')
    })

    it('throws an actionable error for successful empty responses', async () => {
      await expect(parseJsonResponse(new Response('', { status: 200 }), 'Create comment')).rejects.toThrow(
        'Create comment returned an empty response body (200 )',
      )
    })
  })

  describe('assertOkResponse', () => {
    it('allows successful responses without reading the body', async () => {
      await expect(assertOkResponse(new Response(null, { status: 204 }), 'Delete task')).resolves.toBeUndefined()
    })

    it('throws an actionable error for failed responses', async () => {
      await expect(
        assertOkResponse(new Response('Forbidden', { status: 403, statusText: 'Forbidden' }), 'Delete task'),
      ).rejects.toThrow('Delete task failed (403 Forbidden): Forbidden')
    })
  })
})
