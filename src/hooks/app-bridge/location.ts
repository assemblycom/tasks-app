// The client surface embeds at /client, so the portal treats /client as the path prefix and
// prepends it on a cold load. Client task details live at /detail/:id/cu, outside that prefix,
// so they are reported under /client and served back through the /client/:path+ rewrite.
export const CLIENT_SURFACE_PREFIX = '/client'
const CLIENT_DETAIL_PATH = /^\/detail\/[^/]+\/cu\/?$/

// Only params that make a link land somewhere specific. Everything else in the iframe URL is either
// a secret (token), host-owned (clientId, companyId), or a one-shot flag (isRedirect, action, pf)
// that must not end up in a URL the user copies.
const SHAREABLE_PARAMS = ['commentId']

export const toReportedLocation = (pathname: string, search: string) => {
  const path = CLIENT_DETAIL_PATH.test(pathname) ? `${CLIENT_SURFACE_PREFIX}${pathname}` : pathname

  const current = new URLSearchParams(search)
  const shared = new URLSearchParams()
  for (const key of SHAREABLE_PARAMS) {
    const value = current.get(key)
    if (value !== null) shared.set(key, value)
  }
  const query = shared.toString()

  return { path, search: query ? `?${query}` : '' }
}

export const toNavigateHref = (path: string, search: string, token: string | null) => {
  const params = new URLSearchParams(search)
  if (token) params.set('token', token)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}
