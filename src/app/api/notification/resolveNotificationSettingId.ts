import { CopilotAPI } from '@/utils/CopilotAPI'
import { serializeError } from '@/utils/serializeError'

// The Tasks app declares a single notification setting for now, so every IU notification shares
// the sole declared setting's id. When we split into per-category settings (task assigned vs
// comment vs completed), map action -> setting by label/id here. Returns undefined when the app
// has no declared setting in the workspace, so callers omit the id and fall back to no suppression.
//
// We cache only the setting ID, which is stable (per the platform docs: unchanged across label
// renames, uninstall/reinstall, new settings). We never cache the IU's on/off preference — that is
// evaluated by the platform on every send, so a preference change takes effect immediately. The TTL
// only bounds how long a newly declared setting's id takes to be picked up.
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { id: string | undefined; expiresAt: number }>()

export const resolveTasksNotificationSettingId = async ({
  copilot,
  workspaceId,
}: {
  copilot: CopilotAPI
  workspaceId: string
}): Promise<string | undefined> => {
  const cached = cache.get(workspaceId)
  if (cached && cached.expiresAt > Date.now()) return cached.id

  try {
    const { notifications } = await copilot.getNotificationSettings()
    const id = notifications[0]?.id
    cache.set(workspaceId, { id, expiresAt: Date.now() + CACHE_TTL_MS })
    return id
  } catch (e) {
    // Never let settings resolution block delivery: fall back to no suppression (pre-OUT-3929
    // behavior — email is sent, just not gated by preference). Don't cache the failure so the next
    // send retries rather than staying degraded for the whole TTL.
    console.error('resolveTasksNotificationSettingId | failed to resolve; sending without suppression', serializeError(e))
    return undefined
  }
}

// Test seam: clear the per-workspace cache between cases.
export const __clearNotificationSettingCache = (): void => cache.clear()
