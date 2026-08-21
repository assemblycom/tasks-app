import { PublicAttachmentDtoSchema } from '@/app/api/attachments/public/public.dto'
import { RFC3339DateSchema } from '@/types/common'
import { AssigneeType } from '@prisma/client'
import z from 'zod'

export const PublicCommentDtoSchema = z.object({
  id: z.string().uuid(),
  object: z.literal('taskComment'),
  taskId: z.string().uuid(),
  parentCommentId: z.string().uuid().nullable(),
  content: z.string(),
  createdBy: z.string().uuid(),
  createdByUserType: z.nativeEnum(AssigneeType),
  createdDate: RFC3339DateSchema,
  updatedDate: RFC3339DateSchema,
  deletedDate: RFC3339DateSchema.nullable(),
  attachments: z.array(PublicAttachmentDtoSchema).nullable(),
})
export type PublicCommentDto = z.infer<typeof PublicCommentDtoSchema>
