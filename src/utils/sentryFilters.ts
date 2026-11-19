const DESTROYED_PROSEMIRROR_NODE_PATTERN = /Cannot read properties of null \(reading 'node'\)/i

const PROSEMIRROR_STACK_HINT =
  /prosemirror-view|prosemirror-state|@tiptap\/|tapwrite|EditorView\.|setSelection/i

const collectSentryText = (event: {
  message?: string
  exception?: { values?: { type?: string; value?: string; stacktrace?: { frames?: { filename?: string; function?: string }[] } }[] }
}) => {
  const chunks: string[] = []
  if (event.message) chunks.push(event.message)

  for (const entry of event.exception?.values ?? []) {
    if (entry.type) chunks.push(entry.type)
    if (entry.value) chunks.push(entry.value)
    for (const frame of entry.stacktrace?.frames ?? []) {
      if (frame.filename) chunks.push(frame.filename)
      if (frame.function) chunks.push(frame.function)
    }
  }

  return chunks.join('\n')
}

export const shouldDropDestroyedProsemirrorViewSentryEvent = (event: {
  message?: string
  exception?: { values?: { type?: string; value?: string; stacktrace?: { frames?: { filename?: string; function?: string }[] } }[] }
}) => {
  const haystack = collectSentryText(event)
  if (!DESTROYED_PROSEMIRROR_NODE_PATTERN.test(haystack)) return false
  return PROSEMIRROR_STACK_HINT.test(haystack)
}
