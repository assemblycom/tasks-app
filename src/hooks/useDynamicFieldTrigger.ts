import { DYNAMIC_FIELDS } from '@/utils/dynamicFields'
import { useCallback, useRef, useState } from 'react'

interface UseDynamicFieldTriggerOptions {
  /** Return the current cursor offset as a plain-text character index */
  getCursorPos: () => number
  /** The element to anchor the popper to */
  anchorEl: HTMLElement | null
  value: string
  onInsert: (newValue: string, cursorPos: number) => void
}

interface PopperProps {
  open: boolean
  anchorEl: HTMLElement | null
  filterText: string
  onSelect: (fieldKey: string) => void
  onClose: () => void
}

export function useDynamicFieldTrigger({ getCursorPos, anchorEl, value, onInsert }: UseDynamicFieldTriggerOptions) {
  const [open, setOpen] = useState(false)
  const [filterText, setFilterText] = useState('')
  const triggerCursorPos = useRef<number>(-1)
  const valueRef = useRef(value)
  valueRef.current = value

  const close = useCallback(() => {
    setOpen(false)
    setFilterText('')
    triggerCursorPos.current = -1
  }, [])

  const dismiss = useCallback(() => {
    const start = triggerCursorPos.current
    if (start >= 0) {
      const currentValue = valueRef.current
      const cursorPos = getCursorPos()
      const newValue = currentValue.slice(0, start) + currentValue.slice(cursorPos)
      close()
      onInsert(newValue, start)
    } else {
      close()
    }
  }, [close, getCursorPos, onInsert])

  const onSelect = useCallback(
    (fieldKey: string) => {
      const currentValue = valueRef.current
      const token = `{{${fieldKey}}}`
      const start = triggerCursorPos.current
      const cursorPos = getCursorPos()

      const newValue = currentValue.slice(0, start) + token + currentValue.slice(cursorPos)
      const newCursorPos = start + token.length

      close()
      onInsert(newValue, newCursorPos)
    },
    [getCursorPos, onInsert, close],
  )

  const handleChange = useCallback(
    (newValue: string) => {
      const cursorPos = getCursorPos()

      if (!open) {
        if (cursorPos > 0 && newValue[cursorPos - 1] === '{') {
          triggerCursorPos.current = cursorPos - 1
          setFilterText('')
          setOpen(true)
        }
      } else {
        const start = triggerCursorPos.current
        if (cursorPos < start || start < 0) {
          close()
          return
        }

        const textAfterTrigger = newValue.slice(start + 1, cursorPos)

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

  const popperProps: PopperProps = {
    open,
    anchorEl,
    filterText,
    onSelect,
    onClose: dismiss,
  }

  return { popperProps, handleKeyDown, handleChange }
}
