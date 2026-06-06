import type User from '@api/core/models/User.model'
import APIError from '@api/core/exceptions/api'
import { PublicTaskAttachmentService } from '@api/tasks/public/public-attachment.service'
import { mockCopilotAPI } from '@api/tests/__mocks__/CopilotAPI.mock'
import { JSDOM } from 'jsdom'

// `@/config` validates env vars at import time (and `.env.local` is not loaded in the
// `test` environment), so stub the values the import chain reads at module load.
jest.mock('@/config', () => ({
  supabaseBucket: 'test-bucket',
  supabaseProjectUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-anon-key',
}))
// BaseService's constructor news up CopilotAPI and DBClient; stub both so the
// service can be instantiated without real Copilot/Prisma wiring.
jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: { getInstance: () => ({}) },
}))
jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation((token: string) => mockCopilotAPI(token)),
}))

const buildUser = () => ({ workspaceId: 'ws_1', token: 'iu-token' }) as unknown as User

const buildService = () => new PublicTaskAttachmentService(buildUser())

type UploadResult = Awaited<ReturnType<PublicTaskAttachmentService['uploadFromUrl']>>

// Spy on the network/storage step so we exercise only the marker-expansion logic.
const stubUpload = (overrides: Partial<UploadResult> = {}) =>
  jest.spyOn(PublicTaskAttachmentService.prototype, 'uploadFromUrl').mockResolvedValue({
    filePath: 'ws_1/abc.pdf',
    downloadUrl: 'https://signed.example.com/abc.pdf',
    fileName: 'Assembly Testing Evaluation 06-29-2026.pdf',
    mimeType: 'application/pdf',
    fileSize: 1234,
    ...overrides,
  })

describe('PublicTaskAttachmentService#expandPublicAttachmentMarkers', () => {
  afterEach(() => jest.restoreAllMocks())

  // Regression: a real payload where the <public-attachment> marker was reportedly
  // left as-is instead of being promoted to an attachment node.
  it('converts a self-closing <public-attachment> marker that is immediately followed by sibling markup', async () => {
    const body =
      `<public-attachment data-src="https://pub-cdn.apitemplate.io/2026/06/bc703d4c-8c33-48e7-bcda-04aa85b98877.pdf" data-filename="Assembly Testing Evaluation 06-29-2026.pdf" data-filetype="application/pdf" />` +
      `<p>We recently sent a mystery shopper to your property as part of the Capital One Premier compliance efforts. Please download the attached evaluation for your review and complete the required action items below within 14 days.</p>` +
      `<br/><p>As we prepare for future Premier bookings, please note the following <strong>Action Items</strong>:</p>` +
      `<p><strong>- The Front Desk correctly identified the mystery shopper's booking as Capital One Premier Collection, clearly communicated benefits at arrival, and ensured benefits were applied at checkout - keep up the great work!</strong></p>`

    const uploadFromUrl = stubUpload()

    const result = await buildService().expandPublicAttachmentMarkers(body)

    // The marker must be gone and replaced with the attachment node.
    expect(result).not.toContain('<public-attachment')
    expect(result).toContain('data-type="attachment"')
    expect(result).toContain('data-src="https://signed.example.com/abc.pdf"')
    expect(result).toContain('data-filename="Assembly Testing Evaluation 06-29-2026.pdf"')
    expect(result).toContain('data-filetype="application/pdf"')
    expect(result).toContain('data-filesize="1234"')

    // Sibling content following the marker is preserved verbatim.
    expect(result).toContain('We recently sent a mystery shopper')
    expect(result).toContain('<strong>Action Items</strong>')

    // Structural guarantee (the actual bug): the following content must be a SIBLING of the
    // attachment, never nested inside it — `<public-attachment/>` is not a void element, so a
    // naive node-replace would have swallowed the paragraphs as the marker's children.
    const { document } = new JSDOM(result!).window
    const attachment = document.querySelector('div[data-type="attachment"]')!
    expect(attachment).not.toBeNull()
    expect(attachment.querySelector('p')).toBeNull()
    expect(document.querySelectorAll('body > p').length).toBe(3)

    // The download is driven by the marker's declared src + overrides.
    expect(uploadFromUrl).toHaveBeenCalledTimes(1)
    expect(uploadFromUrl).toHaveBeenCalledWith({
      externalUrl: 'https://pub-cdn.apitemplate.io/2026/06/bc703d4c-8c33-48e7-bcda-04aa85b98877.pdf',
      overrideFileName: 'Assembly Testing Evaluation 06-29-2026.pdf',
      overrideMimeType: 'application/pdf',
    })
  })

  it('hoists content out of a marker that explicitly wraps it', async () => {
    stubUpload()
    const body = `<public-attachment data-src="https://cdn.example.com/file.pdf"><p>nested by the parser</p></public-attachment>`

    const result = await buildService().expandPublicAttachmentMarkers(body)

    const { document } = new JSDOM(result!).window
    const attachment = document.querySelector('div[data-type="attachment"]')!
    expect(attachment.querySelector('p')).toBeNull()
    expect(document.querySelector('body > p')?.textContent).toBe('nested by the parser')
  })

  it('renders an <img> node for image mime types', async () => {
    stubUpload({ mimeType: 'image/png', fileName: 'photo.png', downloadUrl: 'https://signed.example.com/photo.png' })
    const body = `<public-attachment data-src="https://cdn.example.com/photo.png" data-filetype="image/png" />`

    const result = await buildService().expandPublicAttachmentMarkers(body)

    const { document } = new JSDOM(result!).window
    const img = document.querySelector('img')!
    expect(img).not.toBeNull()
    expect(img.getAttribute('src')).toBe('https://signed.example.com/photo.png')
    expect(img.getAttribute('alt')).toBe('photo.png')
    expect(document.querySelector('div[data-type="attachment"]')).toBeNull()
  })

  it('throws when a marker is missing the required data-src attribute', async () => {
    const uploadFromUrl = stubUpload()
    const body = `<p>hi</p><public-attachment data-filename="x.pdf" />`

    await expect(buildService().expandPublicAttachmentMarkers(body)).rejects.toThrow(APIError)
    await expect(buildService().expandPublicAttachmentMarkers(body)).rejects.toThrow(
      /position 1 is missing the required data-src/,
    )
    expect(uploadFromUrl).not.toHaveBeenCalled()
  })

  it('throws when there are more markers than the allowed maximum', async () => {
    const uploadFromUrl = stubUpload()
    const marker = `<public-attachment data-src="https://cdn.example.com/a.pdf" />`
    const body = marker.repeat(3)

    await expect(buildService().expandPublicAttachmentMarkers(body)).rejects.toThrow(/Too many <public-attachment> markers/)
    expect(uploadFromUrl).not.toHaveBeenCalled()
  })

  it('returns the body unchanged when there are no markers', async () => {
    const uploadFromUrl = jest.spyOn(PublicTaskAttachmentService.prototype, 'uploadFromUrl')
    const body = '<p>No attachments here</p>'

    const result = await buildService().expandPublicAttachmentMarkers(body)

    expect(result).toBe(body)
    expect(uploadFromUrl).not.toHaveBeenCalled()
  })

  it('returns undefined when body is undefined', async () => {
    const result = await buildService().expandPublicAttachmentMarkers(undefined)
    expect(result).toBeUndefined()
  })
})
