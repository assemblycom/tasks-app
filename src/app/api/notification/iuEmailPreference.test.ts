import { InternalUserNotificationSettings } from '@/types/common'
import { disabledEmailSettingIds, isIuEmailGloballyOff } from './iuEmailPreference'

const settings = (overrides: Partial<InternalUserNotificationSettings> = {}): InternalUserNotificationSettings => ({
  emailSettings: 'active',
  notifyAbout: {},
  ...overrides,
})

describe('disabledEmailSettingIds', () => {
  it('collects ids only for categories with email disabled', () => {
    const result = disabledEmailSettingIds(
      settings({
        notifyAbout: {
          newCommentOnATask: { disableEmail: true, notificationSettingId: 'setting_comment' },
          newTaskAssigned: { disableEmail: false, notificationSettingId: 'setting_assigned' },
          taskCompleted: { disableEmail: true, notificationSettingId: 'setting_completed' },
        },
      }),
    )

    expect(result).toEqual(new Set(['setting_comment', 'setting_completed']))
  })

  it('ignores platform categories without a notificationSettingId', () => {
    const result = disabledEmailSettingIds(
      settings({
        notifyAbout: {
          newMessages: { disableEmail: true },
          newCommentOnATask: { disableEmail: true, notificationSettingId: 'setting_comment' },
        },
      }),
    )

    expect(result).toEqual(new Set(['setting_comment']))
  })

  it('returns an empty set when nothing is disabled or notifyAbout is empty', () => {
    expect(disabledEmailSettingIds(settings())).toEqual(new Set())
    expect(
      disabledEmailSettingIds(
        settings({ notifyAbout: { newCommentOnATask: { disableEmail: false, notificationSettingId: 'setting_comment' } } }),
      ),
    ).toEqual(new Set())
  })
})

describe('isIuEmailGloballyOff', () => {
  it('is false only when emailSettings is explicitly active (case-insensitive)', () => {
    expect(isIuEmailGloballyOff(settings({ emailSettings: 'active' }))).toBe(false)
    expect(isIuEmailGloballyOff(settings({ emailSettings: 'Active' }))).toBe(false)
    expect(isIuEmailGloballyOff(settings({ emailSettings: ' ACTIVE ' }))).toBe(false)
  })

  it('fails closed for any non-active value so a global opt-out is never bypassed', () => {
    expect(isIuEmailGloballyOff(settings({ emailSettings: 'not_active' }))).toBe(true)
    expect(isIuEmailGloballyOff(settings({ emailSettings: 'disabled' }))).toBe(true)
    expect(isIuEmailGloballyOff(settings({ emailSettings: undefined }))).toBe(true)
    expect(isIuEmailGloballyOff(settings({ emailSettings: '' }))).toBe(true)
  })
})
