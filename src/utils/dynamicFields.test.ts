import { resolveDynamicFields } from '@/utils/dynamicFields'

describe('resolveDynamicFields', () => {
  it('substitutes custom variable tokens', () => {
    const result = resolveDynamicFields('Evaluation Review {{hotelName}} checkinDate {{checkinDate}}', {
      hotelName: 'Assembly testing',
      checkinDate: '2026-02-02',
    })
    expect(result).toBe('Evaluation Review Assembly testing checkinDate 2026-02-02')
  })

  it('leaves unknown tokens untouched when no matching custom variable is provided', () => {
    expect(resolveDynamicFields('Hello {{unknown}}', { other: 'x' })).toBe('Hello {{unknown}}')
    expect(resolveDynamicFields('Hello {{unknown}}')).toBe('Hello {{unknown}}')
  })

  it('lets built-in date fields take precedence over custom variables of the same key', () => {
    const result = resolveDynamicFields('{{Current Year}}', { 'Current Year': 'overridden' })
    expect(result).toBe(new Date().getFullYear().toString())
  })

  it('trims surrounding whitespace inside custom variable tokens', () => {
    expect(resolveDynamicFields('{{ hotelName }}', { hotelName: 'Assembly' })).toBe('Assembly')
  })
})
