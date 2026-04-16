import { UserIdsSchema } from '@/utils/assignee'
import { ViewMode } from '@prisma/client'
import { z } from 'zod'

export const FilterOptionsSchema = z.object({
  assignee: UserIdsSchema,
  association: UserIdsSchema,
  creator: UserIdsSchema,
  keyword: z.string(),
  type: z.string(),
})

export const DisplayOptionsSchema = z.object({
  showArchived: z.boolean().optional(),
  showUnarchived: z.boolean().optional(),
  showSubtasks: z.boolean().optional(),
})

export type FilterOptionsType = z.infer<typeof FilterOptionsSchema>

export type DisplayOptions = z.infer<typeof DisplayOptionsSchema>

export const CreateViewSettingsSchema = z.object({
  viewMode: z.nativeEnum(ViewMode),
  filterOptions: FilterOptionsSchema,
  showUnarchived: z.boolean().optional(),
  showArchived: z.boolean().optional(),
  showSubtasks: z.boolean().optional(),
})
export type CreateViewSettingsDTO = z.infer<typeof CreateViewSettingsSchema>
