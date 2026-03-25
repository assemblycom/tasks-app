import dayjs from 'dayjs'

export enum DynamicFieldKey {
  CurrentWeek = 'Current Week',
  CurrentMonth = 'Current Month',
  CurrentQuarter = 'Current Quarter',
  CurrentYear = 'Current Year',
}

export interface DynamicField {
  key: DynamicFieldKey
  label: string
}

export const DYNAMIC_FIELDS: DynamicField[] = [
  { key: DynamicFieldKey.CurrentWeek, label: 'Current Week' },
  { key: DynamicFieldKey.CurrentMonth, label: 'Current Month' },
  { key: DynamicFieldKey.CurrentQuarter, label: 'Current Quarter' },
  { key: DynamicFieldKey.CurrentYear, label: 'Current Year' },
]

function getQuarter(date: dayjs.Dayjs): string {
  const month = date.month() // 0-indexed
  return `Q${Math.floor(month / 3) + 1}`
}

export function resolveDynamicField(key: DynamicFieldKey, now: dayjs.Dayjs = dayjs()): string {
  switch (key) {
    case DynamicFieldKey.CurrentWeek:
      return `Week of ${now.format('MMMM D, YYYY')}`
    case DynamicFieldKey.CurrentMonth:
      return now.format('MMMM')
    case DynamicFieldKey.CurrentQuarter:
      return getQuarter(now)
    case DynamicFieldKey.CurrentYear:
      return now.format('YYYY')
  }
}

/**
 * Resolves all dynamic field tokens in a string.
 * Tokens are in the format {{fieldKey}}, e.g. {{Current Month}}, {{Current Year}}
 */
export function resolveDynamicFields(text: string): string {
  const now = dayjs()
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const field = DYNAMIC_FIELDS.find((f) => f.key === key)
    if (!field) return match
    return resolveDynamicField(field.key, now)
  })
}

/**
 * Resolves <autofill-field data-value="..."> tags in HTML to their actual values.
 */
export function resolveAutofillTags(html: string): string {
  const now = dayjs()
  return html.replace(/<autofill-field\s+data-value="([^"]+)"[^>]*><\/autofill-field>/g, (match, key) => {
    const field = DYNAMIC_FIELDS.find((f) => f.key === key)
    if (!field) return match
    return resolveDynamicField(field.key, now)
  })
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export const DYNAMIC_FIELD_TOKEN_CLASS = 'dynamic-field-token'

/**
 * Convert plain text with {{tokens}} to HTML with styled spans.
 * Token spans have contenteditable="false" so the browser treats them as atomic units.
 * Normalizes multiple braces to exactly double braces before converting.
 */
export function tokensToHtml(text: string): string {
  // Normalize any excess braces (e.g. {{{Current Year}}} → {{Current Year}})
  text = text.replace(/\{{2,}([^{}]+)\}{2,}/g, '{{$1}}')
  return text.replace(/(\{\{[^}]+\}\})/g, (match) => {
    const key = match.slice(2, -2)
    return `<span data-token="${escapeHtml(key)}" contenteditable="false" class="${DYNAMIC_FIELD_TOKEN_CLASS}">${escapeHtml(match)}</span>`
  })
}

/**
 * Extract plain text from a contentEditable div, converting token spans back to {{key}} text.
 * Strips stray braces adjacent to tokens to prevent accumulation.
 */
export function htmlToTokens(element: HTMLElement): string {
  let result = ''
  const nodes = Array.from(element.childNodes)
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node.nodeType === Node.TEXT_NODE) {
      let text = node.textContent ?? ''
      // Strip trailing `{` characters if next sibling is a token span
      const next = nodes[i + 1]
      if (next instanceof HTMLElement && next.dataset.token) {
        text = text.replace(/\{+$/, '')
      }
      // Strip leading `}` characters if previous sibling is a token span
      const prev = nodes[i - 1]
      if (prev instanceof HTMLElement && prev.dataset.token) {
        text = text.replace(/^\}+/, '')
      }
      result += text
    } else if (node instanceof HTMLElement && node.dataset.token) {
      result += `{{${node.dataset.token}}}`
    } else if (node instanceof HTMLElement) {
      result += htmlToTokens(node)
    }
  }
  return result
}
