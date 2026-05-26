import { RFC3339DateSchema } from '@/types/common'
import { AssigneeType } from '@prisma/client'
import z from 'zod'

export const PublicAttachmentDtoSchema = z.object({
  id: z.string().uuid(),
  fileName: z.string(),
  fileSize: z.number(),
  mimeType: z.string(),
  downloadUrl: z.string().url().nullable(),
  uploadedBy: z.string().uuid(),
  uploadedByUserType: z.nativeEnum(AssigneeType).nullable(),
  uploadedDate: RFC3339DateSchema,
})

export type PublicAttachmentDto = z.infer<typeof PublicAttachmentDtoSchema>
