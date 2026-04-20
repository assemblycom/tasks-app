import { DASHBOARD_DOMAIN } from '@/constants/domains'
import { ensureHttps } from '@/utils/https'

type BridgePayload = { type: string }

// Latest payload per `type`, so a handshake / retry / visibility-change can replay current state.
const latestByType = new Map<string, { payload: BridgePayload; portalUrl?: string }>()

// On a fresh iframe navigation (direct load, or the HTTP-redirect flow from /?taskId=…),
// the parent portal may not have re-wired its `message` listener for the new document by the
// time our first `useEffect` fires. Re-post on an expanding schedule so the initial state is
// not lost. The parent is idempotent — the latest payload per type wins.
const RETRY_DELAYS_MS = [100, 300, 800, 1800, 4000]

const postNow = (payload: BridgePayload, portalUrl?: string) => {
  for (const domain of DASHBOARD_DOMAIN) {
    window.parent.postMessage(payload, domain)
  }
  if (portalUrl) {
    window.parent.postMessage(payload, ensureHttps(portalUrl))
  }
}

const replayAll = () => {
  for (const { payload, portalUrl } of latestByType.values()) {
    postNow(payload, portalUrl)
  }
}

let listenersInstalled = false
const installListeners = () => {
  if (listenersInstalled || typeof window === 'undefined') return
  listenersInstalled = true

  // Handshake: replay everything when parent signals it's ready.
  window.addEventListener('message', (event: MessageEvent) => {
    if (event?.data?.type === 'portal.ready') replayAll()
  })

  // If the iframe was hidden and is shown again, or regains focus, the parent may have
  // re-initialised — replay current state.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') replayAll()
    })
  }
  window.addEventListener('focus', replayAll)
  window.addEventListener('pageshow', replayAll)

  // Tell parent we're ready so it can respond with `portal.ready` (if supported).
  postNow({ type: 'app.ready' })
}

export const postMessageParentDashboard = (payload: BridgePayload, portalUrl?: string) => {
  if (typeof window === 'undefined') return

  installListeners()

  latestByType.set(payload.type, { payload, portalUrl })
  postNow(payload, portalUrl)

  for (const delay of RETRY_DELAYS_MS) {
    setTimeout(() => {
      const current = latestByType.get(payload.type)
      if (current && current.payload === payload) {
        postNow(current.payload, current.portalUrl)
      }
    }, delay)
  }
}
