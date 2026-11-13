export const normalizeTokenParam = (token: string | null | undefined): string | null => {
  const trimmedToken = token?.trim()
  if (!trimmedToken) return null

  const queryString = trimmedToken.startsWith('?') ? trimmedToken.slice(1) : trimmedToken
  if (queryString.startsWith('token=')) {
    const nestedToken = new URLSearchParams(queryString).get('token')?.trim()
    return normalizeTokenParam(nestedToken)
  }

  const duplicatedTokenParamIndex = trimmedToken.indexOf('?token=')
  if (duplicatedTokenParamIndex !== -1) {
    const normalizedToken = trimmedToken.slice(0, duplicatedTokenParamIndex).trim()
    return normalizedToken || null
  }

  return trimmedToken
}

export const buildTokenQueryString = (token: string, params: Record<string, string> = {}) =>
  new URLSearchParams({ token, ...params }).toString()
