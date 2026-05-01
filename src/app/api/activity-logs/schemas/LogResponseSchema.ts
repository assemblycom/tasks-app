import { ClientResponseSchema, InternalUsersSchema } from '@/types/common'
import { DBActivityLogDetailsSchema } from '@api/activity-logs/const'
import { ActivityType, AssigneeType } from '@prisma/client'
import { z } from 'zod'

export const LogResponseSchema = z.object({
  id: z.string().uuid(),
  type: z.nativeEnum(ActivityType),
  details: DBActivityLogDetailsSchema,
  taskId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  userRole: z.nativeEnum(AssigneeType),
  workspaceId: z.string(),
  createdAt: z.string().datetime(),
})

export const LogResponseSchemaArrayType = z.array(LogResponseSchema)

export type LogResponse = z.infer<typeof LogResponseSchema>
