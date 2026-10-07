import { generateRandomString } from './generateRandomString'

describe('generateRandomString', () => {
  it('prefixes a uuid and preserves a short original name', () => {
    const result = generateRandomString('photo.png')
    expect(result).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_photo\.png$/i,
    )
  })

  it('truncates very long original names while keeping the extension', () => {
    const longBase = 'Welcome '.repeat(30)
    const result = generateRandomString(`${longBase}Agree.png`)
    const suffix = result.split('_').slice(1).join('_')

    expect(suffix.length).toBeLessThanOrEqual(124)
    expect(suffix.endsWith('.png')).toBe(true)
  })

  it('replaces unsafe characters in the suffix', () => {
    const result = generateRandomString('my file (1).png')
    expect(result).toMatch(/_my_file__1_\.png$/)
  })
})
