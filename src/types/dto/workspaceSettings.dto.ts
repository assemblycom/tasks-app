import { ViewMode } from '@prisma/client'
import { z } from 'zod'

export const AUTO_ARCHIVE_AFTER_DAYS_OPTIONS = [0, 7, 14, 30, 60, 90] as const

export type AutoArchiveAfterDays = (typeof AUTO_ARCHIVE_AFTER_DAYS_OPTIONS)[number]

export const UpdateWorkspaceSettingsSchema = z
  .object({
    autoArchiveAfterDays: z
      .number()
      .int()
      .refine((val): val is AutoArchiveAfterDays => (AUTO_ARCHIVE_AFTER_DAYS_OPTIONS as readonly number[]).includes(val), {
        message: `autoArchiveAfterDays must be one of ${AUTO_ARCHIVE_AFTER_DAYS_OPTIONS.join(', ')}`,
      })
      .optional(),
    clientDefaultViewMode: z.nativeEnum(ViewMode).nullable().optional(),
    clientShowSubtasks: z.boolean().nullable().optional(),
    clientLockViewMode: z.boolean().optional(),
    clientLockShowSubtasks: z.boolean().optional(),
  })
  .strict()

export type UpdateWorkspaceSettingsDTO = z.infer<typeof UpdateWorkspaceSettingsSchema>

export type ClientViewSettings = {
  clientDefaultViewMode: ViewMode | null
  clientShowSubtasks: boolean | null
  clientLockViewMode: boolean
  clientLockShowSubtasks: boolean
}
