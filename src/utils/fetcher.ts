export const fetcher = async (url: string | null) => {
  if (!url) return

  const res = await fetch(url)

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    // url carries the Copilot session token in its query string — keep it out of error reporting
    const path = url.split('?')[0]
    const error = new Error(
      `An error occurred while fetching the data. [${res.status}] ${path}${body ? `: ${body.slice(0, 200)}` : ''}`,
    )
    throw Object.assign(error, { status: res.status })
  }

  return res.json()
}
