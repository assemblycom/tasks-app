import { DYNAMIC_FIELDS, insertToken } from '@/utils/dynamicFields'
import { PopperProps as MuiPopperProps } from '@mui/material'
import { useCallback, useRef, useState } from 'react'

type VirtualElement = Exclude<MuiPopperProps['anchorEl'], null | undefined | HTMLElement>

interface UseDynamicFieldTriggerOptions {
  /** Return the current cursor offset as a plain-text character index */
  getCursorPos: () => number
  value: string
  onInsert: (newValue: string, cursorPos: number) => void
}

export interface DynamicFieldPopperProps {
  open: boolean
  anchorEl: HTMLElement | VirtualElement | null
  filterText: string
  onSelect: (fieldKey: string) => void
  onClose: () => void
}

function getCursorVirtualElement(): VirtualElement | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  return {
    getBoundingClientRect: () => rect,
  }
}

export function useDynamicFieldTrigger({ getCursorPos, value, onInsert }: UseDynamicFieldTriggerOptions) {
  const [open, setOpen] = useState(false)
  const [filterText, setFilterText] = useState('')
  const triggerCursorPos = useRef<number>(-1)
  const cursorAnchorRef = useRef<VirtualElement | null>(null)
  const valueRef = useRef(value)
  valueRef.current = value

  const close = useCallback(() => {
    setOpen(false)
    setFilterText('')
    triggerCursorPos.current = -1
    cursorAnchorRef.current = null
  }, [])

  const dismiss = useCallback(() => {
    close()
  }, [close])

  const onSelect = useCallback(
    (fieldKey: string) => {
      const currentValue = valueRef.current
      const token = `{{${fieldKey}}}`
      const start = triggerCursorPos.current
      // Use trigger position + 2 (for `{{`) + filter text length instead of live cursor,
      // because clicking the menu item may move focus away from the contentEditable div
      const end = start + 2 + filterText.length

      const stripped = currentValue.slice(0, start) + currentValue.slice(end)
      const { newValue, cursorPos: newCursorPos } = insertToken(stripped, start, token)

      close()
      onInsert(newValue, newCursorPos)
    },
    [filterText, onInsert, close],
  )

  const handleChange = useCallback(
    (newValue: string) => {
      const cursorPos = getCursorPos()

      if (!open) {
        // Trigger on exactly `{{` — two consecutive opening braces, not three or more
        if (
          cursorPos >= 2 &&
          newValue[cursorPos - 1] === '{' &&
          newValue[cursorPos - 2] === '{' &&
          (cursorPos < 3 || newValue[cursorPos - 3] !== '{')
        ) {
          triggerCursorPos.current = cursorPos - 2
          cursorAnchorRef.current = getCursorVirtualElement()
          setFilterText('')
          setOpen(true)
        }
      } else {
        const start = triggerCursorPos.current
        if (cursorPos < start || start < 0) {
          close()
          return
        }

        // Check that the opening `{{` is still intact
        const currentBefore = newValue.slice(start, start + 2)
        if (currentBefore !== '{{') {
          close()
          return
        }

        const textAfterTrigger = newValue.slice(start + 2, cursorPos)

        if (textAfterTrigger.includes('}')) {
          close()
          return
        }

        const matches = DYNAMIC_FIELDS.filter(
          (f) =>
            f.key.toLowerCase().startsWith(textAfterTrigger.toLowerCase()) ||
            f.label.toLowerCase().startsWith(textAfterTrigger.toLowerCase()),
        )

        if (matches.length === 0) {
          close()
          return
        }

        setFilterText(textAfterTrigger)
      }
    },
    [getCursorPos, open, close],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
      }
      if (open && e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        dismiss()
      }
    },
    [open, dismiss],
  )

  const popperProps: DynamicFieldPopperProps = {
    open,
    anchorEl: cursorAnchorRef.current,
    filterText,
    onSelect,
    onClose: dismiss,
  }

  return { popperProps, handleKeyDown, handleChange }
}
