jest.mock('@/utils/signUrl', () => ({
  getSignedUrl: jest.fn(),
}))

import { replaceImageSrc, getFilePathFromUrl } from '@/utils/signedUrlReplacer'

describe('replaceImageSrc', () => {
  const mockGetSignedUrl = jest.fn((filePath: string) =>
    Promise.resolve(`https://supabase.co/storage/v1/object/sign/media/${filePath}?token=fresh`),
  )

  beforeEach(() => {
    mockGetSignedUrl.mockClear()
  })

  it('re-signs img tag src', async () => {
    const html = '<p>Hello</p><img src="https://supabase.co/storage/v1/object/sign/media/ws/img.png?token=old">'
    const result = await replaceImageSrc(html, mockGetSignedUrl)
    expect(result).toContain('token=fresh')
    expect(result).not.toContain('token=old')
    expect(mockGetSignedUrl).toHaveBeenCalledWith('ws/img.png')
  })

  it('re-signs attachment tag src', async () => {
    const html =
      '<div data-type="attachment" src="https://supabase.co/storage/v1/object/sign/media/ws/doc.pdf?token=old"></div>'
    const result = await replaceImageSrc(html, mockGetSignedUrl)
    expect(result).toContain('token=fresh')
    expect(result).not.toContain('token=old')
    expect(mockGetSignedUrl).toHaveBeenCalledWith('ws/doc.pdf')
  })

  it('re-signs both img and attachment tags in the same HTML', async () => {
    const html = [
      '<img src="https://supabase.co/storage/v1/object/sign/media/ws/img.png?token=old">',
      '<div data-type="attachment" src="https://supabase.co/storage/v1/object/sign/media/ws/doc.pdf?token=old"></div>',
    ].join('')
    const result = await replaceImageSrc(html, mockGetSignedUrl)
    expect(result).not.toContain('token=old')
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(2)
    expect(mockGetSignedUrl).toHaveBeenCalledWith('ws/img.png')
    expect(mockGetSignedUrl).toHaveBeenCalledWith('ws/doc.pdf')
  })

  it('deduplicates the same URL across img and attachment tags', async () => {
    const url = 'https://supabase.co/storage/v1/object/sign/media/ws/file.png?token=old'
    const html = `<img src="${url}"><div data-type="attachment" src="${url}"></div>`
    await replaceImageSrc(html, mockGetSignedUrl)
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('returns html unchanged when there are no img or attachment tags', async () => {
    const html = '<p>No media here</p>'
    const result = await replaceImageSrc(html, mockGetSignedUrl)
    expect(result).toBe(html)
    expect(mockGetSignedUrl).not.toHaveBeenCalled()
  })

  it('skips URLs that do not contain /media/ path', async () => {
    const html = '<img src="https://example.com/other/path.png">'
    const result = await replaceImageSrc(html, mockGetSignedUrl)
    expect(result).toBe(html)
    expect(mockGetSignedUrl).not.toHaveBeenCalled()
  })
})

describe('getFilePathFromUrl', () => {
  it('extracts file path after /media/', () => {
    const url = 'https://supabase.co/storage/v1/object/sign/media/ws/img.png?token=abc'
    expect(getFilePathFromUrl(url)).toBe('ws/img.png')
  })

  it('returns null for invalid URLs', () => {
    expect(getFilePathFromUrl('not-a-url')).toBeNull()
  })

  it('returns undefined for URLs without /media/ segment', () => {
    expect(getFilePathFromUrl('https://example.com/other/path')).toBeUndefined()
  })
})
