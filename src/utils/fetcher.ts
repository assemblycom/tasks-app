import { getLiveToken } from '@/utils/assemblyTokenStore'

export const fetcher = async (url: string | null) => {
  if (!url) return

  let finalUrl = url

  // On the client, always overwrite ?token=... with the freshest token from
  // the Assembly app-bridge. Server-side callers (during SSR) keep the URL
  // they were given, since the live token store only exists in the browser.
  if (typeof window !== 'undefined') {
    const liveToken = getLiveToken()
    if (liveToken) {
      const u = new URL(url, window.location.origin)
      u.searchParams.set('token', liveToken)
      finalUrl = u.pathname + u.search
    }
  }

  const res = await fetch(finalUrl)

  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.')
    throw error
  }

  return res.json()
}
