const UNRECOGNIZED_SERVER_ACTION_PATTERN =
  /UnrecognizedActionError|Server Action "[^"]+" was not found on the server/i

export const shouldDropUnrecognizedServerActionSentryEvent = (event: {
  message?: string
  exception?: { values?: { type?: string; value?: string }[] }
}) => {
  const message = event.message ?? ''
  if (UNRECOGNIZED_SERVER_ACTION_PATTERN.test(message)) return true

  return (
    event.exception?.values?.some(
      (entry) =>
        entry.type === 'UnrecognizedActionError' ||
        (entry.value != null && UNRECOGNIZED_SERVER_ACTION_PATTERN.test(entry.value)),
    ) ?? false
  )
}
