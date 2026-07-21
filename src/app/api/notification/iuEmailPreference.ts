import { InternalUserNotificationSettings } from '@/types/common'

// Setting ids for which this IU has turned email off. Matched by notificationSettingId (our app's
// categories carry it), so this is independent of the platform's internal category key names.
export const disabledEmailSettingIds = (settings: InternalUserNotificationSettings): Set<string> => {
  const ids = Object.values(settings.notifyAbout)
    .filter((entry) => entry.notificationSettingId && entry.disableEmail)
    .map((entry) => entry.notificationSettingId as string)
  return new Set(ids)
}
