import { ClientResponseSchema, CompanyResponseSchema, InternalUsersSchema } from '@/types/common'
import { CreateTaskRequest } from '@/types/dto/tasks.dto'
import { CreateTemplateRequest } from '@/types/dto/templates.dto'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { IAssigneeCombined } from '@/types/interfaces'
import { z } from 'zod'

export const getTempTask = (
  tempId: string,
  payload: CreateTaskRequest,
  workflowStates: WorkflowStateResponse[],
  assignee: IAssigneeCombined[],
  workspaceId: string,
  userId: string,
  parentId: string,
) => {
  return {
    id: tempId,
    workspaceId: workspaceId,
    assigneeId: (payload.internalUserId || payload.clientId || payload.companyId) ?? '',
    internalUserId: payload.internalUserId ?? null,
    clientId: payload.clientId ?? null,
    companyId: payload.companyId ?? null,
    title: payload.title,
    body: payload.body,
    workflowStateId: payload.workflowStateId,
    workflowState: workflowStates.find((ws) => ws.id === payload.workflowStateId)!,
    createdById: userId,
    assignee: z
      .union([ClientResponseSchema, InternalUsersSchema, CompanyResponseSchema])
      .optional()
      .parse(assignee.find((a) => a.id === (payload.internalUserId || payload.clientId || payload.companyId))),
    createdAt: new Date().toISOString(),
    lastArchivedDate: new Date().toISOString(),
    isArchived: false,
    parentId: parentId,
    dueDate: payload.dueDate ?? undefined,
    subtaskCount: 0,
  }
}

export const getTempTaskTemplate = (
  tempId: string,
  payload: CreateTemplateRequest,
  workspaceId: string,
  userId: string,
  parentId: string,
) => {
  return {
    id: tempId,
    workspaceId: workspaceId,
    title: payload.title,
    body: payload.body ?? '',
    workflowStateId: payload.workflowStateId,
    createdBy: userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parentId: parentId,
    subTaskTemplates: [],
  }
}
