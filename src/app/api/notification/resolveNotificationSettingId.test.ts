import { CopilotAPI } from '@/utils/CopilotAPI'
import { __clearNotificationSettingCache, resolveTasksNotificationSettingId } from './resolveNotificationSettingId'

const buildCopilot = (getNotificationSettings: jest.Mock) => ({ getNotificationSettings }) as unknown as CopilotAPI

beforeEach(() => __clearNotificationSettingCache())

describe('resolveTasksNotificationSettingId', () => {
  it('returns the sole declared setting id', async () => {
    const getNotificationSettings = jest.fn().mockResolvedValue({
      notifications: [{ id: 'setting_tasks', label: 'New task assigned', surfaces: ['product', 'email'] }],
    })

    const id = await resolveTasksNotificationSettingId({
      copilot: buildCopilot(getNotificationSettings),
      workspaceId: 'ws_1',
    })

    expect(id).toBe('setting_tasks')
  })

  it('returns undefined when the app declares no setting', async () => {
    const getNotificationSettings = jest.fn().mockResolvedValue({ notifications: [] })

    const id = await resolveTasksNotificationSettingId({
      copilot: buildCopilot(getNotificationSettings),
      workspaceId: 'ws_1',
    })

    expect(id).toBeUndefined()
  })

  it('caches the id per workspace and does not refetch within the TTL', async () => {
    const getNotificationSettings = jest.fn().mockResolvedValue({
      notifications: [{ id: 'setting_tasks', label: 'New task assigned', surfaces: ['email'] }],
    })
    const copilot = buildCopilot(getNotificationSettings)

    await resolveTasksNotificationSettingId({ copilot, workspaceId: 'ws_1' })
    await resolveTasksNotificationSettingId({ copilot, workspaceId: 'ws_1' })

    expect(getNotificationSettings).toHaveBeenCalledTimes(1)
  })

  it('caches per workspace independently', async () => {
    const getNotificationSettings = jest.fn().mockResolvedValue({
      notifications: [{ id: 'setting_tasks', label: 'New task assigned', surfaces: ['email'] }],
    })
    const copilot = buildCopilot(getNotificationSettings)

    await resolveTasksNotificationSettingId({ copilot, workspaceId: 'ws_1' })
    await resolveTasksNotificationSettingId({ copilot, workspaceId: 'ws_2' })

    expect(getNotificationSettings).toHaveBeenCalledTimes(2)
  })
})
