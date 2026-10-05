type FetchOptions = RequestInit & {
  next?: { tags?: string[] }
}

const parseJsonBody = <T>(text: string): T => {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('Empty API response')
  }

  try {
    return JSON.parse(trimmed) as T
  } catch {
    throw new Error(`Invalid JSON response: ${trimmed.slice(0, 200)}`)
  }
}

export async function fetchWithErrorHandler<T>(input: RequestInfo, options?: FetchOptions, retries = 3): Promise<T> {
  let lastError: any

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, options)

      if (res.status === 500) {
        throw new Error('Internal server error.')
      }

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Fetch failed (${res.status}): ${text}`)
      }

      const data = parseJsonBody<T>(await res.text())
      return data
    } catch (error) {
      lastError = error
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
      }
    }
  }
  throw lastError
}
