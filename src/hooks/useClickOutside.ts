import { useEffect, RefObject } from 'react'

function getEventPath(event: Event): EventTarget[] {
  if ((event as any).composedPath) return (event as any).composedPath()
  if ((event as any).path) return (event as any).path
  const path: EventTarget[] = []
  let node = event.target as HTMLElement | null
  while (node) {
    path.push(node)
    node = node.parentNode as HTMLElement | null
  }
  path.push(window)
  return path
}

/**
 * Detects clicks/touches outside of one or more elements.
 *
 * @param refs - A single ref or an array of refs to elements considered "inside".
 * @param handler - Function called when a click occurs outside all refs.
 * @param events - Event types to listen to (default: ["pointerdown", "touchstart"]).
 */
export default function useClickOutside<T extends HTMLElement>(
  refs: RefObject<T | null> | RefObject<T | null>[],
  handler: (event: Event) => void,
  events: string[] = ['pointerdown', 'touchstart'],
): void {
  useEffect(() => {
    const refArray = Array.isArray(refs) ? refs : [refs]
    const listener = (event: Event) => {
      const path = getEventPath(event)

      if (
        (event.target as HTMLElement)?.closest?.('.MuiPickersPopper-root, .MuiPickersLayout-root, .MuiDateCalendar-root')
      ) {
        return // don't close if the click is inside the MUI date picker (covers both desktop popper and mobile dialog)
      }

      for (const r of refArray) {
        const el = r?.current
        if (!el) continue
        if (path.includes(el) || el.contains(event.target as Node)) {
          return // Click was inside so popper is not closed
        }
      }
      handler(event)
    }
    for (const e of events) {
      window.addEventListener(e, listener, true)
    }
    return () => {
      for (const e of events) {
        window.removeEventListener(e, listener, true)
      }
    }
  }, [refs, handler, events])
}
