export const browserSentryIgnoredErrors = [
  /fetch failed/i,
  /failed to fetch/i,
  /NS Pushstate prevention/i,
  /Blocked attempt to use history\.(replace|push)State\(\)/i,
]

export function isIgnoredBrowserSentryError(errorMessage: string) {
  return browserSentryIgnoredErrors.some((ignoredError) => ignoredError.test(errorMessage))
}
