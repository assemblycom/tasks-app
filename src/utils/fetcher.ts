export const fetcher = async (url: string | null) => {
  if (!url) return

  const res = await fetch(url)

  if (!res.ok) {
    const responseText = await res.text().catch(() => '')
    const detail = responseText ? `: ${responseText.slice(0, 200)}` : ''
    throw new Error(`An error occurred while fetching the data. [${res.status}] ${url}${detail}`)
  }

  return res.json()
}
