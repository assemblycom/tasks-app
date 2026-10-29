// A link in a task body can point back into the portal at another installed app. The portal
// owns those URLs, so we only recognise their shape here; the portal decides whether the
// viewer may open the app. Both the canonical /apps/<installId>[/inner] form and the older
// /apps?id=<installId> form are accepted, with or without the dashboard's /w/<workspace> prefix.
const APP_PATH = /^(?:\/w\/[^/]+)?\/apps\/([A-Za-z0-9_-]+)((?:\/[^/?#]+)*)\/?$/
const APPS_INDEX_PATH = /^(?:\/w\/[^/]+)?\/apps\/?$/
const SAFE_ID = /^[A-Za-z0-9_-]+$/

export interface PortalAppLink {
  installId: string
  path?: string
}

export const parsePortalAppLink = (href: string, portalOrigins: readonly string[]): PortalAppLink | null => {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (!portalOrigins.includes(url.origin)) return null

  const canonical = APP_PATH.exec(url.pathname)
  if (canonical) {
    // The bridge's app destination carries a path but no query, so a link whose destination
    // state lives in its query (a task's ?commentId=) is left to the browser rather than
    // delivered somewhere slightly wrong.
    if (url.search) return null
    const [, installId, innerPath] = canonical
    return innerPath ? { installId, path: innerPath } : { installId }
  }

  if (APPS_INDEX_PATH.test(url.pathname)) {
    const params = new URLSearchParams(url.search)
    const installId = params.get('id')
    params.delete('id')
    if (installId && SAFE_ID.test(installId) && [...params.keys()].length === 0) return { installId }
  }

  return null
}
