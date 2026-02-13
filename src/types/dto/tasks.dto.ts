import { AssigneeType as PrismaAssigneeType, Task } from '@prisma/client'
import { z } from 'zod'
import { WorkflowStateResponseSchema } from './workflowStates.dto'
import { DateStringSchema } from '@/types/date'
import { ClientResponseSchema, CompanyResponseSchema, InternalUsersSchema } from '../common'

export const AssociationSchema = z.object({
  clientId: z.string().uuid().optional(),
  companyId: z.string().uuid(),
})
export type ViewerType = z.infer<typeof AssociationSchema>

export const AssociationsSchema = z.array(AssociationSchema).max(1).optional()
export type Associations = z.infer<typeof AssociationsSchema>

export const validateUserIds = (
  data: { internalUserId?: string | null; clientId?: string | null; companyId?: string | null },
  ctx: z.RefinementCtx,
) => {
  const { internalUserId, clientId, companyId } = data

  if (internalUserId && (clientId || companyId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'internalUserId cannot be combined with clientId or companyId',
      path: ['internalUserId'],
    })
  }

  if (clientId && !companyId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'companyId is required when clientId is provided',
      path: ['companyId'],
    })
  }
}

const validateAssociationAndTaskShare = (
  data: {
    associations?: Associations
    isShared?: boolean
    clientId?: string | null
    companyId?: string | null
    internalUserId?: string | null
  },
  ctx: z.RefinementCtx,
) => {
  const { clientId, companyId, associations, isShared, internalUserId } = data
  if (associations && associations?.length && (clientId || companyId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Task cannot have associations when assignee is client or company',
      path: ['associations'],
    })
  }

  if ((!associations || !associations?.length || !internalUserId) && isShared) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Task cannot be shared with no associations or when assignee is not internal user',
      path: ['isShared'],
    })
  }
}

export const AssigneeTypeSchema = z.nativeEnum(PrismaAssigneeType).nullish()
export type AssigneeType = z.infer<typeof AssigneeTypeSchema>

export const CreateTaskRequestSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().optional(),
    workflowStateId: z.string().uuid(),
    dueDate: DateStringSchema.nullish(),
    parentId: z.string().uuid().nullish(),
    templateId: z.string().uuid().nullish(),
    createdById: z.string().uuid().optional(),
    internalUserId: z.string().uuid().nullish().default(null),
    clientId: z.string().uuid().nullish().default(null),
    companyId: z.string().uuid().nullish().default(null),
    associations: AssociationsSchema, //right now, we only need the feature to have max of 1 viewer per task
    isShared: z.boolean().optional(),
  })
  .superRefine(validateUserIds)
  .superRefine(validateAssociationAndTaskShare)

export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>

export const UpdateTaskRequestSchema = z
  .object({
    title: z.string().optional(),
    body: z.string().optional(),
    workflowStateId: z.string().uuid().optional(),
    dueDate: DateStringSchema.nullish(),
    isArchived: z.boolean().optional(),
    internalUserId: z.string().uuid().nullish(),
    clientId: z.string().uuid().nullish(),
    companyId: z.string().uuid().nullish(),
    associations: AssociationsSchema, //right now, we only need the feature to have max of 1 viewer per task
    isShared: z.boolean().optional(),
  })
  .superRefine(validateUserIds)

export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>

export const TaskResponseSchema = z.object({
  id: z.string(),
  label: z.string(),
  workspaceId: z.string(),
  assigneeId: z.string().optional(),
  assigneeType: AssigneeTypeSchema,
  title: z.string().optional(),
  body: z.string().optional(),
  createdById: z.string(),
  workflowStateId: z.string().uuid().optional(),
  workflowState: WorkflowStateResponseSchema,
  dueDate: DateStringSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullish(),
  assignee: z.union([ClientResponseSchema, InternalUsersSchema, CompanyResponseSchema]).optional(),
  lastActivityLogUpdated: z.string().datetime().nullish(),
  lastSubtaskUpdated: z.string().datetime().nullish(),
  isArchived: z.boolean().optional(),
  lastArchivedDate: z.string().datetime(),
  parentId: z.string().nullish(),
  subtaskCount: z.number(),
  internalUserId: z.string().uuid().nullish(),
  clientId: z.string().uuid().nullish(),
  companyId: z.string().uuid().nullish(),
  associations: AssociationsSchema,
  isShared: z.boolean().optional(),
})

export type TaskResponse = z.infer<typeof TaskResponseSchema>

export const SubTaskStatusSchema = z.object({
  count: z.number(),
  canCreateSubtask: z.boolean(),
})

export type SubTaskStatusResponse = z.infer<typeof SubTaskStatusSchema>

export type AncestorTaskResponse = Pick<Task, 'id' | 'title' | 'label' | 'associations' | 'isShared'> & {
  internalUserId: string | null
  clientId: string | null
  companyId: string | null
}
