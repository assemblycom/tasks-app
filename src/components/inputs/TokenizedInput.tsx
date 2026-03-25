'use client'

import { DynamicFieldsPopper } from '@/components/inputs/DynamicFieldsMenu'
import { useDynamicFieldTrigger } from '@/hooks/useDynamicFieldTrigger'
import { htmlToTokens, tokensToHtml } from '@/utils/dynamicFields'
import { Box, styled } from '@mui/material'
import { Ref, useCallback, useEffect, useImperativeHandle, useRef } from 'react'

interface TokenizedInputProps {
  ref: Ref<HTMLDivElement>
  value: string
  onChange: (newValue: string) => void
  onInsert: (newValue: string, cursorPos: number) => void
  onBlur?: () => void
  onFocus?: () => void
  placeholder?: string
  maxLength?: number
  autoFocus?: boolean
  style?: React.CSSProperties
}

/**
 * Get the cursor offset as a plain-text character index within a contentEditable element.
 */
export function getCursorOffset(container: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return -1

  const range = sel.getRangeAt(0)
  const preRange = document.createRange()
  preRange.selectNodeContents(container)
  preRange.setEnd(range.startContainer, range.startOffset)

  const fragment = preRange.cloneContents()
  const temp = document.createElement('div')
  temp.appendChild(fragment)
  return htmlToTokens(temp).length
}

/**
 * Restore cursor to a plain-text character offset within a contentEditable element.
 */
export function restoreCursorOffset(container: HTMLElement, targetOffset: number) {
  let remaining = targetOffset

  function walk(node: Node): { node: Node; offset: number } | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent ?? '').length
      if (remaining <= len) {
        return { node, offset: remaining }
      }
      remaining -= len
      return null
    }

    if (node instanceof HTMLElement && node.dataset.token) {
      const tokenLen = `{{${node.dataset.token}}}`.length
      if (remaining <= tokenLen) {
        const parent = node.parentNode!
        const index = Array.from(parent.childNodes).indexOf(node as ChildNode)
        return { node: parent, offset: index + 1 }
      }
      remaining -= tokenLen
      return null
    }

    for (const child of Array.from(node.childNodes)) {
      const result = walk(child)
      if (result) return result
    }
    return null
  }

  const pos = walk(container)
  if (pos) {
    const sel = window.getSelection()
    if (sel) {
      const range = document.createRange()
      range.setStart(pos.node, pos.offset)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }
}

/**
 * Find the closest token span from a DOM node (walking up).
 */
function findTokenSpan(node: Node | null): HTMLElement | null {
  let current = node
  while (current && current !== document) {
    if (current instanceof HTMLElement && current.dataset.token) return current
    current = current.parentNode
  }
  return null
}

/**
 * Move cursor after a token if the cursor is currently inside one.
 */
function moveCursorOutOfToken(container: HTMLElement) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const tokenEl = findTokenSpan(sel.anchorNode)
  if (!tokenEl || !tokenEl.parentNode) return
  const index = Array.from(tokenEl.parentNode.childNodes).indexOf(tokenEl as ChildNode)
  const range = document.createRange()
  range.setStart(tokenEl.parentNode, index + 1)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

export const TokenizedInput = ({
  ref,
  value,
  onChange,
  onInsert,
  onBlur,
  onFocus,
  placeholder,
  maxLength = 255,
  autoFocus,
  style,
}: TokenizedInputProps) => {
  const divRef = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)

  useImperativeHandle(ref, () => divRef.current as HTMLDivElement)

  const getCursorPos = useCallback(() => {
    const div = divRef.current
    if (!div) return 0
    return getCursorOffset(div)
  }, [])

  const {
    popperProps,
    handleKeyDown: dynamicFieldKeyDown,
    handleChange: dynamicFieldHandleChange,
  } = useDynamicFieldTrigger({
    getCursorPos,
    value,
    onInsert,
  })

  // Sync innerHTML when value changes externally
  useEffect(() => {
    const div = divRef.current
    if (!div) return

    const currentText = htmlToTokens(div)
    if (currentText !== value) {
      const offset = getCursorOffset(div)
      div.innerHTML = tokensToHtml(value) || ''
      if (document.activeElement === div && offset >= 0) {
        restoreCursorOffset(div, Math.min(offset, value.length))
      }
    }
  }, [value])

  useEffect(() => {
    if (autoFocus && divRef.current) {
      divRef.current.focus()
    }
  }, [autoFocus])

  /**
   * Self-healing input handler: reads the DOM, extracts plain text,
   * and if any token was corrupted (text inserted inside it), rebuilds the HTML.
   */
  const handleInput = useCallback(() => {
    if (isComposingRef.current) return
    const div = divRef.current
    if (!div) return

    // Check if any token span has been corrupted (browser inserted text inside it)
    let corrupted = false
    div.querySelectorAll('[data-token]').forEach((span) => {
      const expected = `{{${(span as HTMLElement).dataset.token}}}`
      if (span.textContent !== expected) {
        corrupted = true
      }
    })

    let newText = htmlToTokens(div)

    // If corrupted, rebuild the HTML from plain text to fix token spans
    if (corrupted) {
      const offset = getCursorOffset(div)
      div.innerHTML = tokensToHtml(newText)
      restoreCursorOffset(div, Math.min(offset, newText.length))
    }

    if (newText.length > maxLength) {
      const offset = getCursorOffset(div)
      newText = newText.slice(0, maxLength)
      div.innerHTML = tokensToHtml(newText)
      restoreCursorOffset(div, Math.min(offset, newText.length))
    }

    onChange(newText)
    dynamicFieldHandleChange(newText)
  }, [onChange, dynamicFieldHandleChange, maxLength])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      dynamicFieldKeyDown(e)
    },
    [dynamicFieldKeyDown],
  )

  // After click settles, move cursor out of any token span
  const handleClick = useCallback(() => {
    if (divRef.current) {
      moveCursorOutOfToken(divRef.current)
    }
  }, [])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (divRef.current) moveCursorOutOfToken(divRef.current)
    const text = e.clipboardData.getData('text/plain').replace(/\n/g, ' ')
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(document.createTextNode(text))
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
    divRef.current?.dispatchEvent(new Event('input', { bubbles: true }))
  }, [])

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      <StyledEditableDiv
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        onFocus={onFocus}
        onPaste={handlePaste}
        onCompositionStart={() => {
          isComposingRef.current = true
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false
          handleInput()
        }}
        data-placeholder={placeholder}
        style={style}
      />
      <DynamicFieldsPopper {...popperProps} />
    </Box>
  )
}

TokenizedInput.displayName = 'TokenizedInput'

const StyledEditableDiv = styled('div')(({ theme }) => ({
  width: '100%',
  outline: 'none',
  border: 'none',
  whiteSpace: 'pre-wrap',
  wordWrap: 'break-word',
  overflowWrap: 'break-word',
  color: theme.color.gray[600],
  fontFamily: 'inherit',
  minHeight: '1em',
  '&:empty::before': {
    content: 'attr(data-placeholder)',
    color: theme.color.gray[400],
    pointerEvents: 'none',
  },
}))
