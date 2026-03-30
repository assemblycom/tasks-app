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

// Maximum possible resolved length for each dynamic field.
// Used to compute worst-case task title length when tokens are present.
// "Week of September 30, 2026" is the longest possible resolution for CurrentWeek (26 chars).
const DYNAMIC_FIELD_MAX_RESOLVED_LENGTHS: Record<DynamicFieldKey, number> = {
  [DynamicFieldKey.CurrentWeek]: 26,
  [DynamicFieldKey.CurrentMonth]: 9, // "September"
  [DynamicFieldKey.CurrentQuarter]: 2, // "Q4"
  [DynamicFieldKey.CurrentYear]: 4, // "2026"
}

/**
 * Returns the worst-case resolved length of a template title string.
 * Each {{token}} is replaced by its maximum possible resolved value so the result
 * represents the longest task title that could be generated from this template.
 */
export function getWorstCaseResolvedLength(text: string): number {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
    const field = DYNAMIC_FIELDS.find((f) => f.key === key)
    if (!field) return match
    return 'x'.repeat(DYNAMIC_FIELD_MAX_RESOLVED_LENGTHS[field.key])
  }).length
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
