/**
 * Pure helper functions for inserting dynamic field tokens from the sidebar
 * into the template title (TokenizedInput) or description (Tapwrite).
 */

/**
 * Build a new title string with the {{token}} spliced in at the given cursor position.
 */
export function insertTokenInTitle(
  currentTitle: string,
  fieldKey: string,
  cursorPos: number,
): { newValue: string; newCursorPos: number } {
  const token = `{{${fieldKey}}}`
  const pos = cursorPos >= 0 ? cursorPos : currentTitle.length
  const newValue = currentTitle.slice(0, pos) + token + currentTitle.slice(pos)
  return { newValue, newCursorPos: pos + token.length }
}

/**
 * Insert an `<autofill-field>` element at the current DOM selection inside a
 * container element.  Returns `true` if the insertion happened (i.e. the
 * selection was inside the container), `false` otherwise.
 *
 * Because `mousedown` on the sidebar card calls `preventDefault()`, the
 * Tapwrite editor keeps focus and the browser selection stays intact.
 * ProseMirror's MutationObserver picks up the DOM change and converts it
 * into the matching schema node.
 */
export function insertAutofillAtCursor(container: HTMLElement, fieldKey: string): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false

  const range = sel.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return false

  const autofillEl = document.createElement('autofill-field')
  autofillEl.setAttribute('data-value', fieldKey)
  const spaceNode = document.createTextNode('\u00A0')

  range.collapse(false)
  range.insertNode(spaceNode)
  range.insertNode(autofillEl)

  // Move cursor after the inserted content
  range.setStartAfter(spaceNode)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)

  return true
}

/**
 * Return a new HTML string with an `<autofill-field>` tag appended at the end
 * of the body content.
 */
export function insertAutofillIntoHtml(html: string, fieldKey: string): string {
  const tag = `<autofill-field data-value="${fieldKey}"></autofill-field>`

  if (!html || html === '<p></p>' || html.trim() === '') {
    return `<p>${tag} </p>`
  }

  const lastPIndex = html.lastIndexOf('</p>')
  if (lastPIndex !== -1) {
    return html.slice(0, lastPIndex) + tag + ' ' + html.slice(lastPIndex)
  }

  return html + `<p>${tag} </p>`
}
