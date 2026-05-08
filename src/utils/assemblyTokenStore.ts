/**
 * Module-level live store for the Assembly session token.
 *
 * The token expires every 5 minutes. The Assembly parent dashboard pushes
 * fresh tokens to this iframe via @assembly-js/app-bridge. `useTokenRefresh`
 * is the only writer; everything else must read the latest value via
 * `getLiveToken()` at the moment a request is fired (never closed over).
 */

let liveToken: string | undefined

export const setLiveToken = (token: string | undefined) => {
  liveToken = token
}

export const getLiveToken = (): string | undefined => liveToken

/**
 * Returns the live token, throwing if it has not been seeded yet. Use this at
 * imperative client call sites (server-action callers, fetch URLs, navigation
 * link builders). The seed runs synchronously inside `useTokenRefresh`'s lazy
 * useState init, so by the time any user-driven handler fires this is always
 * populated.
 */
export const requireLiveToken = (): string => {
  if (!liveToken) {
    throw new Error('Assembly token not initialized; ensure useTokenRefresh has mounted')
  }
  return liveToken
}
