import APIError from '@/app/api/core/exceptions/api'
import { AttachmentsService } from '@/app/api/attachments/attachments.service'
import {
  collapseNativeAttachmentTagsToPublicTags,
  expandPublicAttachmentTagsInDescription,
} from '@/utils/publicAttachmentTagTransformer'
import { Attachment } from '@prisma/client'

jest.mock('@/utils/signUrl', () => ({
  getSignedUrl: jest.fn(
    async (filePath: string) => `https://example.supabase.co/storage/v1/object/sign/media/${filePath}?token=t`,
  ),
}))

const buildAttachment = (overrides: Partial<Attachment>): Attachment => ({
  id: 'attachment-id-1',
  taskId: null,
  commentId: null,
  workspaceId: 'workspace-1',
  filePath: 'workspace-1/sample-file.png',
  fileSize: 100,
  fileType: 'image/png',
  fileName: 'sample-file.png',
  createdById: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  deletedAt: null,
  ...overrides,
})

const buildAttachmentsServiceStub = (orphans: Attachment[]): AttachmentsService =>
  ({
    findOrphanAttachmentsByIds: jest.fn(async (ids: string[]) => orphans.filter((row) => ids.includes(row.id))),
  }) as unknown as AttachmentsService

describe('expandPublicAttachmentTagsInDescription', () => {
  it('replaces <public-attachment id="..." /> with native <img> for image mime types', async () => {
    const imageOrphan = buildAttachment({ id: 'a1', filePath: 'workspace-1/a1.png', fileType: 'image/png' })
    const { expandedDescription, resolvedOrphanAttachments } = await expandPublicAttachmentTagsInDescription({
      description: '<p>Hello</p><public-attachment id="a1" />',
      attachmentsService: buildAttachmentsServiceStub([imageOrphan]),
    })

    expect(expandedDescription).toContain('<img src="')
    expect(expandedDescription).toContain('workspace-1/a1.png')
    expect(expandedDescription).not.toContain('public-attachment')
    expect(resolvedOrphanAttachments).toHaveLength(1)
    expect(resolvedOrphanAttachments[0].id).toBe('a1')
  })

  it('replaces non-image attachments with full Tapwrite-native DOM (data-* metadata + <attachment-view>)', async () => {
    const pdfOrphan = buildAttachment({
      id: 'a2',
      filePath: 'workspace-1/a2.pdf',
      fileType: 'application/pdf',
      fileName: 'report.pdf',
      fileSize: 12345,
    })
    const { expandedDescription } = await expandPublicAttachmentTagsInDescription({
      description: '<public-attachment id="a2" />',
      attachmentsService: buildAttachmentsServiceStub([pdfOrphan]),
    })

    expect(expandedDescription).toContain('data-type="attachment"')
    expect(expandedDescription).toContain(
      'data-src="https://example.supabase.co/storage/v1/object/sign/media/workspace-1/a2.pdf?token=t"',
    )
    expect(expandedDescription).toContain('data-filename="report.pdf"')
    expect(expandedDescription).toContain('data-filetype="application/pdf"')
    expect(expandedDescription).toContain('data-filesize="12345"')
    expect(expandedDescription).toContain('data-loading="false"')
    expect(expandedDescription).toContain('<attachment-view')
    expect(expandedDescription).toContain('filename="report.pdf"')
    expect(expandedDescription).toContain('filesize="12345"')
    expect(expandedDescription).toContain('>report.pdf</attachment-view>')
    expect(expandedDescription).not.toContain('<img')
  })

  it('escapes special characters in filenames so attribute values stay well-formed', async () => {
    const orphan = buildAttachment({
      id: 'a3',
      filePath: 'workspace-1/a3.pdf',
      fileType: 'application/pdf',
      fileName: 'Q1 "Report" & <draft>.pdf',
      fileSize: 1,
    })
    const { expandedDescription } = await expandPublicAttachmentTagsInDescription({
      description: '<public-attachment id="a3" />',
      attachmentsService: buildAttachmentsServiceStub([orphan]),
    })

    expect(expandedDescription).toContain('data-filename="Q1 &quot;Report&quot; &amp; &lt;draft&gt;.pdf"')
    expect(expandedDescription).not.toContain('"Report"')
    expect(expandedDescription).not.toContain('<draft>')
  })

  it('throws an APIError listing every unresolvable attachment id', async () => {
    const presentOrphan = buildAttachment({ id: 'present' })
    await expect(
      expandPublicAttachmentTagsInDescription({
        description:
          '<public-attachment id="present" /><public-attachment id="missing-1" /><public-attachment id="missing-2" />',
        attachmentsService: buildAttachmentsServiceStub([presentOrphan]),
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('handles multiple references to the same id (dedup) and various tag closures', async () => {
    const imageOrphan = buildAttachment({ id: 'shared', filePath: 'workspace-1/shared.png' })
    const findSpy = jest.spyOn(buildAttachmentsServiceStub([imageOrphan]), 'findOrphanAttachmentsByIds')
    const stubWithSpy = {
      findOrphanAttachmentsByIds: jest.fn(async (ids: string[]) => {
        expect(new Set(ids).size).toBe(ids.length) // ids should be deduped before db call
        return [imageOrphan].filter((row) => ids.includes(row.id))
      }),
    } as unknown as AttachmentsService

    const { expandedDescription } = await expandPublicAttachmentTagsInDescription({
      description: '<public-attachment id="shared" /><public-attachment id="shared"></public-attachment>',
      attachmentsService: stubWithSpy,
    })

    expect((expandedDescription.match(/<img/g) ?? []).length).toBe(2)
    findSpy.mockRestore()
  })

  it('is a no-op when the description has no <public-attachment> tags', async () => {
    const { expandedDescription, resolvedOrphanAttachments } = await expandPublicAttachmentTagsInDescription({
      description: '<p>Just text, no attachments here</p>',
      attachmentsService: buildAttachmentsServiceStub([]),
    })
    expect(expandedDescription).toBe('<p>Just text, no attachments here</p>')
    expect(resolvedOrphanAttachments).toHaveLength(0)
  })

  it('returns an empty string when the description is undefined', async () => {
    const { expandedDescription } = await expandPublicAttachmentTagsInDescription({
      description: undefined,
      attachmentsService: buildAttachmentsServiceStub([]),
    })
    expect(expandedDescription).toBe('')
  })
})

describe('collapseNativeAttachmentTagsToPublicTags', () => {
  it('collapses an <img> whose src maps to a known attachment back to a <public-attachment> tag', () => {
    const taskAttachment = buildAttachment({
      id: 'bound-1',
      filePath: 'workspace-1/task-123/some-image.png',
      taskId: 'task-123',
    })
    const body =
      '<p>See:</p><img src="https://x.supabase.co/storage/v1/object/sign/media/workspace-1/task-123/some-image.png?token=abc" />'

    const collapsed = collapseNativeAttachmentTagsToPublicTags({ body, taskAttachments: [taskAttachment] })

    expect(collapsed).toContain('<public-attachment id="bound-1" />')
    expect(collapsed).not.toContain('<img')
  })

  it('collapses a non-image attachment (full Tapwrite DOM) back to a <public-attachment> tag', () => {
    const taskAttachment = buildAttachment({
      id: 'bound-pdf',
      filePath: 'workspace-1/task-9/report.pdf',
      fileType: 'application/pdf',
      fileName: 'report.pdf',
      taskId: 'task-9',
    })
    const url = 'https://x.supabase.co/storage/v1/object/sign/media/workspace-1/task-9/report.pdf?token=abc'
    const body =
      `<div data-type="attachment" data-src="${url}" data-filename="report.pdf" data-filetype="application/pdf" data-filesize="100" data-loading="false">` +
      `<attachment-view src="${url}" filename="report.pdf" filetype="application/pdf" filesize="100" target="_blank" rel="noopener noreferrer">report.pdf</attachment-view>` +
      `</div>`

    const collapsed = collapseNativeAttachmentTagsToPublicTags({ body, taskAttachments: [taskAttachment] })

    expect(collapsed).toContain('<public-attachment id="bound-pdf" />')
    expect(collapsed).not.toContain('data-type="attachment"')
    expect(collapsed).not.toContain('<attachment-view')
  })

  it('strips <img> tags whose src does not map to any attachment (legacy sanitizeHtml behavior)', () => {
    const body = '<p>Hello</p><img src="https://elsewhere.example.com/random.png" />'
    const collapsed = collapseNativeAttachmentTagsToPublicTags({ body, taskAttachments: [] })
    expect(collapsed).not.toContain('<img')
    expect(collapsed).toContain('<p>Hello</p>')
  })

  it('strips empty <p></p> tags', () => {
    const body = '<p>Real</p><p></p><p>  </p>'
    const collapsed = collapseNativeAttachmentTagsToPublicTags({ body, taskAttachments: [] })
    expect(collapsed).toBe('<p>Real</p>')
  })

  it('handles null/undefined body', () => {
    expect(collapseNativeAttachmentTagsToPublicTags({ body: null, taskAttachments: [] })).toBe('')
    expect(collapseNativeAttachmentTagsToPublicTags({ body: undefined, taskAttachments: [] })).toBe('')
  })
})

describe('round-trip', () => {
  it('expand then collapse using the post-creation task-scoped path produces the original wire format', async () => {
    // After expand, file is at orphan path. After the create sweep, file is at task-scoped path.
    // Outbound serializer sees the task-scoped row in task.attachments and matches by filePath.
    const orphan = buildAttachment({ id: 'r1', filePath: 'workspace-1/r1.png' })
    const { expandedDescription } = await expandPublicAttachmentTagsInDescription({
      description: '<p>Round-trip</p><public-attachment id="r1" />',
      attachmentsService: buildAttachmentsServiceStub([orphan]),
    })

    // Simulate the post-create sweep: the row's filePath becomes task-scoped and the body URL changes
    // to a fresh signed URL of that new path. The id stays the same because the sweep reuses the row.
    const boundAttachment = buildAttachment({
      id: 'r1',
      filePath: 'workspace-1/task-555/r1.png',
      taskId: 'task-555',
    })
    const bodyAfterSweep = expandedDescription.replace(
      /src="[^"]+"/,
      'src="https://x.supabase.co/storage/v1/object/sign/media/workspace-1/task-555/r1.png?token=fresh"',
    )

    const collapsed = collapseNativeAttachmentTagsToPublicTags({
      body: bodyAfterSweep,
      taskAttachments: [boundAttachment],
    })

    expect(collapsed).toContain('<public-attachment id="r1" />')
    expect(collapsed).toContain('<p>Round-trip</p>')
  })
})
