import { RFC3339DateSchema } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { AssigneeType } from '@prisma/client'
import { z } from 'zod'
import { validateUserIds, AssociationsSchema } from '@/types/dto/tasks.dto'
import { PublicAttachmentDtoSchema } from '@/app/api/attachments/public/public.dto'

export const TaskSourceSchema = z.enum(['web', 'api'])
export type TaskSource = z.infer<typeof TaskSourceSchema>
export const StatusSchema = z.enum(['todo', 'inProgress', 'completed'])

export const PublicTaskCreateStatusSchema = z
  .enum(['todo', 'inProgress', 'completed'])
  .optional()
  .or(z.literal(''))
  .transform((val) => (val === '' ? undefined : val))

export const PublicTaskDtoSchema = z.object({
  id: z.string(),
  object: z.literal('task'),
  name: z.string(),
  description: z.string().nullable(),
  parentTaskId: z.string().uuid().nullable(),
  dueDate: RFC3339DateSchema.nullable(),
  label: z.string(),
  status: StatusSchema,
  templateId: z.string().nullable(),
  completedDate: RFC3339DateSchema.nullable(),
  createdBy: z.string().uuid(),
  createdDate: RFC3339DateSchema,
  creatorType: z.literal('internalUser'),
  isArchived: z.boolean(),
  archivedDate: RFC3339DateSchema.nullable(),
  archivedBy: z.string().uuid().nullable(),
  isDeleted: z.boolean().nullable(),
  deletedDate: RFC3339DateSchema.nullable(),
  source: TaskSourceSchema,
  deletedBy: z.string().uuid().nullable(),
  completedBy: z.string().uuid().nullable(),
  completedByUserType: z.nativeEnum(AssigneeType).nullable(),
  internalUserId: z.string().uuid().nullable(),
  clientId: z.string().uuid().nullable(),
  companyId: z.string().uuid().nullable(),
  association: AssociationsSchema,
  attachments: z.array(PublicAttachmentDtoSchema),
  isShared: z.boolean().optional(),
})
export type PublicTaskDto = z.infer<typeof PublicTaskDtoSchema>

export const publicTaskCreateDtoSchemaFactory = (token: string) => {
  return z
    .object({
      name: z.string().max(255).optional(), // allow empty/whitespace, validated in superRefine
      description: z.string().optional(),
      parentTaskId: z.string().uuid().optional(),
      status: StatusSchema.optional(),
      dueDate: RFC3339DateSchema.optional(),
      templateId: z.string().uuid().nullish(),
      createdBy: z.string().uuid().optional(),
      internalUserId: z.string().uuid().optional(),
      clientId: z.string().uuid().optional(),
      companyId: z.string().uuid().optional(),
      association: AssociationsSchema, //right now, we only need the feature to have max of 1 viewer per task
      isShared: z.boolean().optional(),
    })
    .superRefine(async (data, ctx) => {
      const { name, templateId, internalUserId, clientId, status } = data
      let { companyId } = data

      const nameIsValid = typeof name === 'string' && name.trim().length > 0
      const hasTemplateId = typeof templateId === 'string' && templateId.length > 0
      const statusIsValid = typeof status === 'string' && ['todo', 'inProgress', 'completed'].includes(status)

      if (!hasTemplateId && !nameIsValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Name is required when templateId is not provided',
          path: ['name'],
        })
      }

      if (!hasTemplateId && !statusIsValid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Status is required and must be valid when templateId is not provided',
          path: ['status'],
        })
      }

      // If companyId is not provided, try to infer it from the clientId if client has only one company
      if (clientId && !companyId) {
        const copilot = new CopilotAPI(token)
        const client = await copilot.getClient(clientId)
        if (Array.isArray(client.companyIds) && client.companyIds.length === 1) {
          data.companyId = client.companyIds[0]
        }
        // Backwards compatibility in case a client has companyId only and undefined / empty array in companyIds (you can never be too careful)
        else if (
          client.companyId &&
          // This prevents us from picking companyId when there are already many companies in companyIds
          (!client.companyIds || (Array.isArray(client.companyIds) && !client.companyIds.length))
        ) {
          data.companyId = client.companyId
        }
        // If client has multiple companies, throw error
        else if (Array.isArray(client.companyIds)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'companyId must be provided for clients with more than one company',
            path: ['companyId'],
          })
        } else {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'companyId must be provided when clientId is provided',
            path: ['companyId'],
          })
        }
      }

      if (internalUserId && (clientId || companyId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'internalUserId cannot be combined with clientId or companyId',
          path: ['internalUserId'],
        })
      }
    })
}

export type PublicTaskCreateDto = z.infer<ReturnType<typeof publicTaskCreateDtoSchemaFactory>>

export const PublicTaskUpdateDtoSchema = z
  .object({
    name: z
      .string()
      .max(255)
      .optional()
      .refine((name) => name === undefined || name.trim().length > 0, {
        message: 'Name must not be empty',
      })
      .transform((val) => (val === undefined ? val : val.trim())),
    description: z.string().optional(),
    dueDate: RFC3339DateSchema.nullish(),
    status: StatusSchema.optional(),
    isArchived: z.boolean().optional(),
    internalUserId: z.string().uuid().nullish(),
    clientId: z.string().uuid().nullish(),
    companyId: z.string().uuid().nullish(),
    association: AssociationsSchema,
    isShared: z.boolean().optional(),
  })
  .superRefine(validateUserIds)

export type PublicTaskUpdateDto = z.infer<typeof PublicTaskUpdateDtoSchema>
