import { StateType } from '@prisma/client'
import { z } from 'zod'

export const WorkflowStateTypeSchema = z.enum(['backlog', 'unstarted', 'started', 'completed', 'cancelled'])
export type WorkflowState = z.infer<typeof WorkflowStateTypeSchema>

export const CreateWorkflowStateRequestSchema = z.object({
  type: WorkflowStateTypeSchema,
  name: z.string(),
  color: z.string().optional(),
})
export type CreateWorkflowStateRequest = z.infer<typeof CreateWorkflowStateRequestSchema>

export const UpdateWorkflowStateRequestSchema = z.object({
  name: z.string().trim().min(1).max(255),
})
export type UpdateWorkflowStateRequest = z.infer<typeof UpdateWorkflowStateRequestSchema>

export const WorkflowStateResponseSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  type: WorkflowStateTypeSchema,
  name: z.string(),
  key: z.string(),
  color: z.string().nullable(),
})
export type WorkflowStateResponse = z.infer<typeof WorkflowStateResponseSchema>
