const REQUEST_BODY_SIZE_LIMIT_PATTERN = /Body exceeded .* limit/i

export const shouldDropRequestBodySizeLimitSentryEvent = (event: {
  message?: string
  exception?: { values?: { value?: string }[] }
}) => {
  const message = event.message ?? ''
  if (REQUEST_BODY_SIZE_LIMIT_PATTERN.test(message)) return true

  return (
    event.exception?.values?.some((entry) => entry.value && REQUEST_BODY_SIZE_LIMIT_PATTERN.test(entry.value)) ?? false
  )
}
