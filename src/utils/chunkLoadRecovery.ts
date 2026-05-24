const CHUNK_LOAD_RELOAD_KEY_PREFIX = 'tasks-app:chunk-load-reload'
const CHUNK_LOAD_RELOAD_COOLDOWN_MS = 60_000
const RECENT_CHUNK_LOAD_FAILURE_TTL_MS = 30_000

let lastChunkLoadFailureAt = 0

type BrowserWindow = Window & {
  __tasksChunkLoadRecoveryRegistered?: boolean
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function getErrorMessage(errorOrMessage: unknown): string {
  if (typeof errorOrMessage === 'string') return errorOrMessage
  if (errorOrMessage instanceof Error) return `${errorOrMessage.name}: ${errorOrMessage.message}`

  if (errorOrMessage && typeof errorOrMessage === 'object') {
    const { name, message } = errorOrMessage as { name?: unknown; message?: unknown }
    if (typeof message === 'string') {
      return typeof name === 'string' ? `${name}: ${message}` : message
    }
  }

  return ''
}

export function isChunkLoadErrorLike(errorOrMessage: unknown): boolean {
  const message = getErrorMessage(errorOrMessage)

  return (
    /\bChunkLoadError\b/i.test(message) ||
    /\bFailed to load chunk\b/i.test(message) ||
    /\bLoading chunk\b.+\bfailed\b/i.test(message)
  )
}

export function isReactParentNodeNullErrorLike(errorOrMessage: unknown): boolean {
  return /Cannot read properties of null \(reading ['"]parentNode['"]\)/.test(getErrorMessage(errorOrMessage))
}

export function getChunkLoadFailureIdentifier(errorOrMessage: unknown): string {
  const message = getErrorMessage(errorOrMessage)
  const failedChunkMatch = message.match(/\bFailed to load chunk\s+(\S+)/i)
  if (failedChunkMatch?.[1]) return failedChunkMatch[1]

  const loadingChunkMatch = message.match(/\bLoading chunk\s+(\S+)\s+failed\b/i)
  if (loadingChunkMatch?.[1]) return loadingChunkMatch[1]

  return 'unknown'
}

export function markChunkLoadFailure(now = Date.now()): void {
  lastChunkLoadFailureAt = now
}

export function hasRecentChunkLoadFailure(now = Date.now()): boolean {
  return lastChunkLoadFailureAt > 0 && now - lastChunkLoadFailureAt < RECENT_CHUNK_LOAD_FAILURE_TTL_MS
}

export function shouldReloadForChunkLoadFailure(
  chunkIdentifier: string,
  storage: StorageLike,
  now = Date.now(),
): boolean {
  const storageKey = `${CHUNK_LOAD_RELOAD_KEY_PREFIX}:${chunkIdentifier}`
  const lastReloadAt = Number(storage.getItem(storageKey) || 0)

  if (Number.isFinite(lastReloadAt) && now - lastReloadAt < CHUNK_LOAD_RELOAD_COOLDOWN_MS) {
    return false
  }

  storage.setItem(storageKey, String(now))
  return true
}

export function registerChunkLoadRecovery(enabled: boolean): void {
  if (!enabled || typeof window === 'undefined') return

  const browserWindow = window as BrowserWindow
  if (browserWindow.__tasksChunkLoadRecoveryRegistered) return
  browserWindow.__tasksChunkLoadRecoveryRegistered = true

  const recover = (errorOrMessage: unknown) => {
    if (!isChunkLoadErrorLike(errorOrMessage)) return

    markChunkLoadFailure()

    try {
      if (
        !shouldReloadForChunkLoadFailure(
          getChunkLoadFailureIdentifier(errorOrMessage),
          browserWindow.sessionStorage,
        )
      ) {
        return
      }
    } catch {
      return
    }

    browserWindow.location.reload()
  }

  browserWindow.addEventListener('error', (event) => {
    recover(event.error || event.message)
  })

  browserWindow.addEventListener('unhandledrejection', (event) => {
    recover(event.reason)
  })
}
