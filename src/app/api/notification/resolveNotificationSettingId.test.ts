import { CopilotAPI } from '@/utils/CopilotAPI'
import { GroupedEmailEventType } from '@prisma/client'
import { __clearNotificationSettingCache, resolveIuNotificationSettingId } from './resolveNotificationSettingId'

const buildCopilot = (getNotificationSettings: jest.Mock) => ({ getNotificationSettings }) as unknown as CopilotAPI

const settings = [
  { id: 'setting_assigned', label: 'New task assigned', surfaces: ['product', 'email'] },
  { id: 'setting_comment', label: 'New comment on a task', surfaces: ['product', 'email'] },
  { id: 'setting_completed', label: 'Task completed', surfaces: ['product', 'email'] },
]

beforeEach(() => __clearNotificationSettingCache())

describe('resolveIuNotificationSettingId', () => {
  it('maps each category to its declared setting id by label', async () => {
    const copilot = buildCopilot(jest.fn().mockResolvedValue({ notifications: settings }))

    expect(
      await resolveIuNotificationSettingId({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.ASSIGNED }),
    ).toBe('setting_assigned')
    expect(
      await resolveIuNotificationSettingId({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.COMMENT }),
    ).toBe('setting_comment')
    expect(
      await resolveIuNotificationSettingId({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.COMPLETED }),
    ).toBe('setting_completed')
  })

  it('matches labels case-insensitively and ignoring surrounding whitespace', async () => {
    const copilot = buildCopilot(
      jest.fn().mockResolvedValue({ notifications: [{ id: 'x', label: '  NEW task Assigned ', surfaces: ['email'] }] }),
    )

    expect(
      await resolveIuNotificationSettingId({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.ASSIGNED }),
    ).toBe('x')
  })

  it('returns undefined when the category is not declared', async () => {
    const copilot = buildCopilot(jest.fn().mockResolvedValue({ notifications: [settings[0]] }))

    expect(
      await resolveIuNotificationSettingId({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.COMMENT }),
    ).toBeUndefined()
  })

  it('returns undefined for SHARED (no IU setting declared)', async () => {
    const copilot = buildCopilot(jest.fn().mockResolvedValue({ notifications: settings }))

    expect(
      await resolveIuNotificationSettingId({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.SHARED }),
    ).toBeUndefined()
  })

  it('caches the label map per workspace and does not refetch within the TTL', async () => {
    const getNotificationSettings = jest.fn().mockResolvedValue({ notifications: settings })
    const copilot = buildCopilot(getNotificationSettings)

    await resolveIuNotificationSettingId({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.ASSIGNED })
    await resolveIuNotificationSettingId({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.COMMENT })

    expect(getNotificationSettings).toHaveBeenCalledTimes(1)
  })

  it('returns undefined when the fetch fails, without caching the failure', async () => {
    const getNotificationSettings = jest
      .fn()
      .mockRejectedValueOnce(new Error('copilot 5xx'))
      .mockResolvedValueOnce({ notifications: settings })
    const copilot = buildCopilot(getNotificationSettings)

    expect(
      await resolveIuNotificationSettingId({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.ASSIGNED }),
    ).toBeUndefined()
    expect(
      await resolveIuNotificationSettingId({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.ASSIGNED }),
    ).toBe('setting_assigned')
    expect(getNotificationSettings).toHaveBeenCalledTimes(2)
  })

  it('caches per workspace independently', async () => {
    const getNotificationSettings = jest.fn().mockResolvedValue({ notifications: settings })
    const copilot = buildCopilot(getNotificationSettings)

    await resolveIuNotificationSettingId({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.ASSIGNED })
    await resolveIuNotificationSettingId({ copilot, workspaceId: 'ws_2', category: GroupedEmailEventType.ASSIGNED })

    expect(getNotificationSettings).toHaveBeenCalledTimes(2)
  })
})
