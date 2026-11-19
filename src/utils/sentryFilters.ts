const NO_CLIENT_FOUND_PATTERN = /No client found with/i

export const shouldDropCopilotMissingClientSentryEvent = (event: {
  message?: string
  exception?: { values?: { value?: string }[] }
}) => {
  const message = event.message ?? ''
  if (NO_CLIENT_FOUND_PATTERN.test(message)) return true

  return event.exception?.values?.some((entry) => entry.value && NO_CLIENT_FOUND_PATTERN.test(entry.value)) ?? false
}
