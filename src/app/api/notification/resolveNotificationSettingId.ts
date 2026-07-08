import { NotificationSetting } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { serializeError } from '@/utils/serializeError'
import { GroupedEmailEventType } from '@prisma/client'

// Canonical labels the Tasks app declares on its Assembly app record (App Setup > Notifications).
export const IU_NOTIFICATION_LABELS: Partial<Record<GroupedEmailEventType, string>> = {
  [GroupedEmailEventType.ASSIGNED]: 'New task assigned',
  [GroupedEmailEventType.COMMENT]: 'New comment on a task',
  [GroupedEmailEventType.COMPLETED]: 'Task completed',
}

// Passed on IU sends so the platform gates each requested surface against the IU's preference.
export type IuNotificationSetting = {
  id: string | undefined
  emailEnabled: boolean
}

// Cache the declared settings per workspace, keyed by normalized label.
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { byLabel: Map<string, NotificationSetting>; expiresAt: number }>()

const normalize = (label: string): string => label.trim().toLowerCase()

const getSettingsByLabel = async ({
  copilot,
  workspaceId,
}: {
  copilot: CopilotAPI
  workspaceId: string
}): Promise<Map<string, NotificationSetting>> => {
  const cached = cache.get(workspaceId)
  if (cached && cached.expiresAt > Date.now()) return cached.byLabel

  const { notifications } = await copilot.getNotificationSettings()
  const byLabel = new Map(notifications.map((setting) => [normalize(setting.label), setting]))
  cache.set(workspaceId, { byLabel, expiresAt: Date.now() + CACHE_TTL_MS })
  return byLabel
}

// Resolve the declared setting for an IU notification category. Returns emailEnabled=false when the
// category has no declared setting (email is not sent until it's configured in the dashboard) and,
// fail-closed, on fetch failure too — we withhold IU email rather than risk sending it past a
// preference we couldn't read. Failures are not cached, so the next send retries.
export const resolveIuNotificationSetting = async ({
  copilot,
  workspaceId,
  category,
}: {
  copilot: CopilotAPI
  workspaceId: string
  category: GroupedEmailEventType
}): Promise<IuNotificationSetting> => {
  const label = IU_NOTIFICATION_LABELS[category]
  if (!label) return { id: undefined, emailEnabled: false }

  try {
    const byLabel = await getSettingsByLabel({ copilot, workspaceId })
    const setting = byLabel.get(normalize(label))
    if (!setting) return { id: undefined, emailEnabled: false }
    return { id: setting.id, emailEnabled: setting.surfaces.includes('email') } //right now we are using setting.surfaces. We need support from assembly to expose a prop which indicates if email is turned on for the event.
  } catch (e) {
    console.error('resolveIuNotificationSetting | failed to resolve; withholding IU email', serializeError(e))
    return { id: undefined, emailEnabled: false }
  }
}

// Test seam: clear the per-workspace cache between cases.
export const __clearNotificationSettingCache = (): void => cache.clear()
