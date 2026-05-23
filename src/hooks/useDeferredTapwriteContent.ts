import { useCallback, useEffect, useRef } from 'react'

export const useDeferredTapwriteContent = (content: string, onContentChange: (content: string) => void) => {
  const contentRef = useRef(content)
  const onContentChangeRef = useRef(onContentChange)
  const pendingContentRef = useRef<string | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    onContentChangeRef.current = onContentChange
  }, [onContentChange])

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return useCallback((nextContent: string) => {
    if (nextContent === contentRef.current) {
      return
    }

    pendingContentRef.current = nextContent

    if (timeoutRef.current !== null) {
      return
    }

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null

      const pendingContent = pendingContentRef.current
      pendingContentRef.current = null

      if (pendingContent === null || pendingContent === contentRef.current) {
        return
      }

      onContentChangeRef.current(pendingContent)
    }, 0)
  }, [])
}
