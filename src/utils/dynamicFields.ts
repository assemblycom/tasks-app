import dayjs from 'dayjs'

export interface DynamicField {
  key: string
  label: string
}

export const DYNAMIC_FIELDS: DynamicField[] = [
  { key: 'Current Week', label: 'Current Week' },
  { key: 'Current Month', label: 'Current Month' },
  { key: 'Current Quarter', label: 'Current Quarter' },
  { key: 'Current Year', label: 'Current Year' },
]

function getQuarter(date: dayjs.Dayjs): string {
  const month = date.month() // 0-indexed
  return `Q${Math.floor(month / 3) + 1}`
}

export function resolveDynamicField(key: string, now: dayjs.Dayjs = dayjs()): string {
  switch (key) {
    case 'Current Week':
      return `Week of ${now.format('MMMM D')}`
    case 'Current Month':
      return now.format('MMMM')
    case 'Current Quarter':
      return getQuarter(now)
    case 'Current Year':
      return now.format('YYYY')
    default:
      return `{{${key}}}`
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
    return resolveDynamicField(key, now)
  })
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const TOKEN_SPAN_STYLE =
  'border:1px solid #D0D4DA;color:#6B6F76;background:#F5F5F5;border-radius:4px;padding:0 4px;white-space:nowrap;'

/**
 * Convert plain text with {{tokens}} to HTML with styled spans.
 * Token spans have contenteditable="false" so the browser treats them as atomic units.
 */
export function tokensToHtml(text: string): string {
  return text.replace(/(\{\{[^}]+\}\})/g, (match) => {
    const key = match.slice(2, -2)
    return `<span data-token="${escapeHtml(key)}" contenteditable="false" style="${TOKEN_SPAN_STYLE}">${escapeHtml(match)}</span>`
  })
}

/**
 * Extract plain text from a contentEditable div, converting token spans back to {{key}} text.
 */
export function htmlToTokens(element: HTMLElement): string {
  let result = ''
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? ''
    } else if (node instanceof HTMLElement && node.dataset.token) {
      result += `{{${node.dataset.token}}}`
    } else if (node instanceof HTMLElement) {
      // Handle nested elements (e.g., browser may wrap text in divs on Enter)
      result += htmlToTokens(node)
    }
  }
  return result
}
