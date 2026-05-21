const mockCreateClient = jest.fn<unknown, unknown[]>(() => ({}))

jest.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

jest.mock('@/config', () => ({
  supabaseAnonKey: 'anon-key',
  supabaseProjectUrl: 'https://example.supabase.co',
}))

describe('supabase client', () => {
  beforeEach(() => {
    jest.resetModules()
    mockCreateClient.mockClear()
  })

  it('does not use Supabase Auth browser locks', async () => {
    await import('@/lib/supabase')

    expect(mockCreateClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
          lock: expect.any(Function),
        }),
      }),
    )

    const options = mockCreateClient.mock.calls[0][2] as unknown as {
      auth: { lock: (_name: string, _acquireTimeout: number, fn: () => Promise<string>) => Promise<string> }
    }
    const lockedOperation = jest.fn().mockResolvedValue('ok')

    await expect(options.auth.lock('supabase-auth-token', -1, lockedOperation)).resolves.toBe('ok')
    expect(lockedOperation).toHaveBeenCalledTimes(1)
  })

  it('uses the same auth-safe options for the singleton client', async () => {
    const { default: SupabaseClient } = await import('@/lib/supabase')

    SupabaseClient.getInstance()

    expect(mockCreateClient).toHaveBeenCalledTimes(2)
    expect(mockCreateClient.mock.calls[1][2]).toEqual(mockCreateClient.mock.calls[0][2])
  })
})
