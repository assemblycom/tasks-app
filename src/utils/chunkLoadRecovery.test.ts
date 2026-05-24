import {
  getChunkLoadFailureIdentifier,
  hasRecentChunkLoadFailure,
  isChunkLoadErrorLike,
  isReactParentNodeNullErrorLike,
  markChunkLoadFailure,
  shouldReloadForChunkLoadFailure,
} from './chunkLoadRecovery'

describe('chunkLoadRecovery', () => {
  it('detects Turbopack chunk load failures', () => {
    expect(
      isChunkLoadErrorLike(
        new Error('Failed to load chunk /_next/static/chunks/13v8.zgvhw8dn.js from module 964893'),
      ),
    ).toBe(true)
  })

  it('detects Webpack chunk load failures', () => {
    expect(isChunkLoadErrorLike('ChunkLoadError: Loading chunk app/layout failed.')).toBe(true)
  })

  it('extracts a stable chunk identifier from an error message', () => {
    expect(
      getChunkLoadFailureIdentifier(
        'ChunkLoadError: Failed to load chunk /_next/static/chunks/13v8.zgvhw8dn.js from module 964893',
      ),
    ).toBe('/_next/static/chunks/13v8.zgvhw8dn.js')
  })

  it('detects the React stream parentNode follow-up error', () => {
    expect(isReactParentNodeNullErrorLike("TypeError: Cannot read properties of null (reading 'parentNode')")).toBe(
      true,
    )
  })

  it('tracks recent chunk load failures', () => {
    markChunkLoadFailure(1_000)

    expect(hasRecentChunkLoadFailure(10_000)).toBe(true)
    expect(hasRecentChunkLoadFailure(40_000)).toBe(false)
  })

  it('allows only one reload attempt per chunk during the cooldown', () => {
    const storage = new Map<string, string>()
    const storageLike = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
    }

    expect(shouldReloadForChunkLoadFailure('chunk-a.js', storageLike, 1_000)).toBe(true)
    expect(shouldReloadForChunkLoadFailure('chunk-a.js', storageLike, 30_000)).toBe(false)
    expect(shouldReloadForChunkLoadFailure('chunk-a.js', storageLike, 70_000)).toBe(true)
  })
})
