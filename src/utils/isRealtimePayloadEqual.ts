import type { RealTimeTaskResponse } from '@/hoc/RealTime'
import type { RealTimeTemplateResponse } from '@/hoc/RealtimeTemplates'
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

const taskRealtimeFields = [
  'id',
  'label',
  'workspaceId',
  'assigneeId',
  'internalUserId',
  'clientId',
  'companyId',
  'assigneeType',
  'title',
  'body',
  'createdById',
  'workflowStateId',
  'assignedAt',
  'completedAt',
  'dueDate',
  'lastActivityLogUpdated',
  'lastSubtaskUpdated',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'parentId',
  'subtaskCount',
  'path',
  'isArchived',
  'lastArchivedDate',
  'source',
  'templateId',
  'completedBy',
  'completedByUserType',
  'archivedBy',
  'deletedBy',
  'associations',
  'isShared',
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toRecord = (value: unknown): Record<string, unknown> | undefined => (isRecord(value) ? value : undefined)

const arePrimitiveRecordValuesEqual = (newValue: Record<string, unknown>, oldValue: Record<string, unknown>): boolean => {
  const keys = [...new Set([...Object.keys(newValue), ...Object.keys(oldValue)])]
  return keys.every((key) => Object.is(newValue[key], oldValue[key]))
}

const areFlatArraysEqual = (newValue: unknown[], oldValue: unknown[]): boolean => {
  if (newValue.length !== oldValue.length) return false
  return newValue.every((item, index) => {
    const oldItem = oldValue[index]
    if (isRecord(item) && isRecord(oldItem)) {
      return arePrimitiveRecordValuesEqual(item, oldItem)
    }
    return Object.is(item, oldItem)
  })
}

const areRealtimeValuesEqual = (newValue: unknown, oldValue: unknown): boolean => {
  if (Object.is(newValue, oldValue)) return true
  if (Array.isArray(newValue) && Array.isArray(oldValue)) {
    return areFlatArraysEqual(newValue, oldValue)
  }
  if (isRecord(newValue) && isRecord(oldValue)) {
    return arePrimitiveRecordValuesEqual(newValue, oldValue)
  }
  return false
}

export function isTaskPayloadEqual(
  payload: RealtimePostgresChangesPayload<RealTimeTaskResponse | RealTimeTemplateResponse>,
): boolean {
  const newPayload = toRecord(payload.new)
  const oldPayload = toRecord(payload.old)
  if (!newPayload || !oldPayload) return true
  return taskRealtimeFields.every((field) => areRealtimeValuesEqual(newPayload[field], oldPayload[field]))
}

export function isTemplatePayloadEqual(payload: RealtimePostgresChangesPayload<RealTimeTemplateResponse>): boolean {
  const { new: n, old: o } = payload

  const hasRequiredFields = (obj: {} | RealTimeTemplateResponse): obj is RealTimeTemplateResponse =>
    typeof obj === 'object' &&
    obj !== null &&
    'title' in obj &&
    'body' in obj &&
    'workflowStateId' in obj &&
    'deletedAt' in obj

  if (!hasRequiredFields(n) || !hasRequiredFields(o)) {
    return false
  }

  return n.title === o.title && n.body === o.body && n.workflowStateId === o.workflowStateId && n.deletedAt === o.deletedAt
}
