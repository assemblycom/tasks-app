import { isRetryablePrismaConnectionError, withDbRetry } from './dbRetry'

describe('dbRetry', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('identifies Prisma connection initialization errors as retryable', () => {
    expect(
      isRetryablePrismaConnectionError(Object.assign(new Error('init failed'), { name: 'PrismaClientInitializationError' })),
    ).toBe(true)
    expect(isRetryablePrismaConnectionError(Object.assign(new Error('cannot reach db'), { code: 'P1001' }))).toBe(true)
    expect(isRetryablePrismaConnectionError(Object.assign(new Error('server closed'), { errorCode: 'P1017' }))).toBe(true)
    expect(isRetryablePrismaConnectionError(new Error('validation failed'))).toBe(false)
  })

  it('retries transient Prisma connection errors before resolving', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    const operation = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(Object.assign(new Error('cannot reach db'), { code: 'P1001' }))
      .mockResolvedValueOnce('ok')

    const result = withDbRetry({ operation, options: { minTimeoutMs: 0, randomize: false } })
    await expect(result).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('does not retry non-connection errors', async () => {
    const operation = jest.fn<Promise<string>, []>().mockRejectedValueOnce(new Error('bad query'))

    await expect(withDbRetry({ operation })).rejects.toThrow('bad query')
    expect(operation).toHaveBeenCalledTimes(1)
  })
})
