/**
 * True when an input or textarea *outside* the given editor element currently has focus.
 *
 * Used to skip submit-on-Enter handlers when the user is typing into a popover
 * rendered in a portal (e.g. the Tapwrite Link bubble input). Focus events from
 * portals bubble through the React tree, so parent focus state tracking can't
 * distinguish "editor is focused" from "a popover input inside the editor
 * wrapper is focused". The DOM activeElement check resolves that.
 */
export const isPopoverInputFocused = (editorEl: HTMLElement | null | undefined): boolean => {
  const active = document.activeElement as HTMLElement | null
  if (!active) return false
  const tag = active.tagName
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return false
  return !editorEl || !editorEl.contains(active)
}
