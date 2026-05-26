import z from 'zod'

export const PublicAttachmentDtoSchema = z.object({
  fileName: z.string(),
  fileSize: z.number(),
  mimeType: z.string(),
  downloadUrl: z.string().url().nullable(),
})

export type PublicAttachmentDto = z.infer<typeof PublicAttachmentDtoSchema>
