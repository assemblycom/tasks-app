jest.mock('@/utils/CopilotAPI', () => ({ CopilotAPI: class {} }))
jest.mock('@/lib/db', () => ({ __esModule: true, default: { getInstance: () => ({}) } }))
jest.mock('@/app/api/attachments/public/public.serializer', () => ({
  PublicAttachmentSerializer: { serializeAttachments: jest.fn(async () => []) },
}))
jest.mock('@/utils/santizeContents', () => ({ sanitizeHtml: (value: string) => value }))
jest.mock('@/utils/signedUrlReplacer', () => ({
  replaceMediaSources: jest.fn(async (value: string) => value),
  replaceImageSrc: jest.fn(async (value: string) => value),
}))
jest.mock('@/utils/signUrl', () => ({ getSignedUrl: jest.fn(async (value: string) => value) }))
jest.mock('@/utils/signedTemplateUrlReplacer', () => ({
  copyTemplateMediaToTask: jest.fn(async (_workspaceId: string, value: string) => value),
}))

import { PublicTaskSerializer, TaskWithWorkflowStateAndAttachments } from './public.serializer'

const IU_ID = '22222222-2222-2222-2222-222222222222'

const makeTask = (overrides: Partial<TaskWithWorkflowStateAndAttachments> = {}): TaskWithWorkflowStateAndAttachments =>
  ({
    id: '11111111-1111-1111-1111-111111111111',
    title: 'A task',
    body: null,
    parentId: null,
    dueDate: null,
    label: '',
    templateId: null,
    createdById: IU_ID,
    completedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    isArchived: false,
    lastArchivedDate: null,
    archivedBy: null,
    deletedAt: null,
    source: 'api',
    deletedBy: null,
    completedBy: null,
    completedByUserType: null,
    internalUserId: IU_ID,
    clientId: null,
    companyId: null,
    associations: [],
    isShared: false,
    workflowState: { type: 'started' },
    attachments: [],
    ...overrides,
  }) as unknown as TaskWithWorkflowStateAndAttachments

// OUT-4029: label generation was removed but the public API keeps the `label`
// field for backward compatibility — empty string for new tasks, the stored
// value for pre-existing ones. These lock that contract so a future change
// can't silently drop the field again.
describe('PublicTaskSerializer — label backward compatibility', () => {
  it('returns an empty-string label for tasks created after label generation was removed', async () => {
    const result = await PublicTaskSerializer.serializeUnsafe(makeTask({ label: '' }))
    expect(result.label).toBe('')
  })

  it('preserves the pre-existing generated label for older tasks', async () => {
    const result = await PublicTaskSerializer.serializeUnsafe(makeTask({ label: 'OUT-001' }))
    expect(result.label).toBe('OUT-001')
  })

  it('keeps label in the schema-validated public DTO', async () => {
    const result = await PublicTaskSerializer.serialize(makeTask({ label: 'OUT-001' }))
    expect(result.label).toBe('OUT-001')
  })
})
