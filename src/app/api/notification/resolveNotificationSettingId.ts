import { CopilotAPI } from '@/utils/CopilotAPI'
import { serializeError } from '@/utils/serializeError'
import { GroupedEmailEventType } from '@prisma/client'

// Canonical labels the Tasks app declares on its Assembly app record (App Setup > Notifications).
// Must match the declared setting labels exactly. SHARED is absent — shared notifications only ever
// target clients, never IUs.
export const IU_NOTIFICATION_LABELS: Partial<Record<GroupedEmailEventType, string>> = {
  [GroupedEmailEventType.ASSIGNED]: 'New task assigned',
  [GroupedEmailEventType.COMMENT]: 'New comment on a task',
  [GroupedEmailEventType.COMPLETED]: 'Task completed',
}

// Cache only the stable label -> id map per workspace (ids are stable per the platform docs). We
// never cache an IU's on/off preference — the platform evaluates that on every send. The TTL only
// bounds how long a newly declared setting's id takes to be picked up.
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { labelToId: Map<string, string>; expiresAt: number }>()

const normalize = (label: string): string => label.trim().toLowerCase()

const getLabelToId = async ({
  copilot,
  workspaceId,
}: {
  copilot: CopilotAPI
  workspaceId: string
}): Promise<Map<string, string>> => {
  const cached = cache.get(workspaceId)
  if (cached && cached.expiresAt > Date.now()) return cached.labelToId

  const { notifications } = await copilot.getNotificationSettings()
  const labelToId = new Map(notifications.map((setting) => [normalize(setting.label), setting.id]))
  cache.set(workspaceId, { labelToId, expiresAt: Date.now() + CACHE_TTL_MS })
  return labelToId
}

// Resolve the declared setting id for an IU notification category so a send can pass it and let the
// platform gate each requested surface per the IU's preference. Returns undefined when the category
// isn't declared or the fetch fails — callers then send without an id (no per-IU gating on that
// send). Failures are not cached, so the next send retries.
export const resolveIuNotificationSettingId = async ({
  copilot,
  workspaceId,
  category,
}: {
  copilot: CopilotAPI
  workspaceId: string
  category: GroupedEmailEventType
}): Promise<string | undefined> => {
  const label = IU_NOTIFICATION_LABELS[category]
  if (!label) return undefined

  try {
    const labelToId = await getLabelToId({ copilot, workspaceId })
    return labelToId.get(normalize(label))
  } catch (e) {
    console.error('resolveIuNotificationSettingId | failed to resolve; sending without gating', serializeError(e))
    return undefined
  }
}

// Test seam: clear the per-workspace cache between cases.
export const __clearNotificationSettingCache = (): void => cache.clear()
