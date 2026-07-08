import { CopilotAPI } from '@/utils/CopilotAPI'
import { GroupedEmailEventType } from '@prisma/client'
import { __clearNotificationSettingCache, resolveIuNotificationSetting } from './resolveNotificationSettingId'

const buildCopilot = (getNotificationSettings: jest.Mock) => ({ getNotificationSettings }) as unknown as CopilotAPI

const settings = [
  { id: 'setting_assigned', label: 'New task assigned', surfaces: ['product', 'email'] },
  { id: 'setting_comment', label: 'New comment on a task', surfaces: ['product', 'email'] },
  { id: 'setting_completed', label: 'Task completed', surfaces: ['product', 'email'] },
]

beforeEach(() => __clearNotificationSettingCache())

describe('resolveIuNotificationSetting', () => {
  it('maps each category to its declared setting by label, with email enabled', async () => {
    const copilot = buildCopilot(jest.fn().mockResolvedValue({ notifications: settings }))

    expect(
      await resolveIuNotificationSetting({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.ASSIGNED }),
    ).toEqual({ id: 'setting_assigned', emailEnabled: true })
    expect(
      await resolveIuNotificationSetting({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.COMMENT }),
    ).toEqual({ id: 'setting_comment', emailEnabled: true })
  })

  it('reports emailEnabled=false when the declared setting omits the email surface', async () => {
    const copilot = buildCopilot(
      jest.fn().mockResolvedValue({ notifications: [{ id: 'x', label: 'New task assigned', surfaces: ['product'] }] }),
    )

    expect(
      await resolveIuNotificationSetting({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.ASSIGNED }),
    ).toEqual({ id: 'x', emailEnabled: false })
  })

  it('matches labels case-insensitively and ignoring surrounding whitespace', async () => {
    const copilot = buildCopilot(
      jest.fn().mockResolvedValue({ notifications: [{ id: 'x', label: '  NEW task Assigned ', surfaces: ['email'] }] }),
    )

    expect(
      await resolveIuNotificationSetting({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.ASSIGNED }),
    ).toEqual({ id: 'x', emailEnabled: true })
  })

  it('returns id undefined and emailEnabled false when the category is not declared', async () => {
    const copilot = buildCopilot(jest.fn().mockResolvedValue({ notifications: [settings[0]] }))

    expect(
      await resolveIuNotificationSetting({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.COMMENT }),
    ).toEqual({ id: undefined, emailEnabled: false })
  })

  it('returns emailEnabled false for SHARED (no IU setting declared)', async () => {
    const copilot = buildCopilot(jest.fn().mockResolvedValue({ notifications: settings }))

    expect(
      await resolveIuNotificationSetting({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.SHARED }),
    ).toEqual({ id: undefined, emailEnabled: false })
  })

  it('caches the settings per workspace and does not refetch within the TTL', async () => {
    const getNotificationSettings = jest.fn().mockResolvedValue({ notifications: settings })
    const copilot = buildCopilot(getNotificationSettings)

    await resolveIuNotificationSetting({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.ASSIGNED })
    await resolveIuNotificationSetting({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.COMMENT })

    expect(getNotificationSettings).toHaveBeenCalledTimes(1)
  })

  it('fails closed (no id, emailEnabled false) when the fetch fails, without caching the failure', async () => {
    const getNotificationSettings = jest
      .fn()
      .mockRejectedValueOnce(new Error('copilot 5xx'))
      .mockResolvedValueOnce({ notifications: settings })
    const copilot = buildCopilot(getNotificationSettings)

    expect(
      await resolveIuNotificationSetting({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.ASSIGNED }),
    ).toEqual({ id: undefined, emailEnabled: false })
    expect(
      await resolveIuNotificationSetting({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.ASSIGNED }),
    ).toEqual({ id: 'setting_assigned', emailEnabled: true })
    expect(getNotificationSettings).toHaveBeenCalledTimes(2)
  })

  it('caches per workspace independently', async () => {
    const getNotificationSettings = jest.fn().mockResolvedValue({ notifications: settings })
    const copilot = buildCopilot(getNotificationSettings)

    await resolveIuNotificationSetting({ copilot, workspaceId: 'ws_1', category: GroupedEmailEventType.ASSIGNED })
    await resolveIuNotificationSetting({ copilot, workspaceId: 'ws_2', category: GroupedEmailEventType.ASSIGNED })

    expect(getNotificationSettings).toHaveBeenCalledTimes(2)
  })
})
