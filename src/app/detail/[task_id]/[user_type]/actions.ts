'use server'

import { ScrapMediaRequest } from '@/types/common'
import { CreateAttachmentRequest } from '@/types/dto/attachments.dto'
import { CreateComment, UpdateComment } from '@/types/dto/comment.dto'
import { UpdateTaskRequest, Associations } from '@/types/dto/tasks.dto'
import { assertOkResponse, getInternalApiUrl, parseJsonResponse } from '@/utils/internalApi'
import { getForwardedAssemblyHeaders } from '@/utils/serverHeaders'

type ActionComment = { id: string }

const jsonHeaders = async (): Promise<Record<string, string>> => ({
  ...(await getForwardedAssemblyHeaders()),
  'Content-Type': 'application/json',
})

export const updateTaskDetail = async ({
  token,
  taskId,
  payload,
}: {
  token: string
  taskId: string
  payload: UpdateTaskRequest
}) => {
  const response = await fetch(await getInternalApiUrl(`/api/tasks/${taskId}?token=${token}`), {
    method: 'PATCH',
    headers: await jsonHeaders(),
    body: JSON.stringify({
      workflowStateId: payload.workflowStateId,
      internalUserId: payload.internalUserId,
      clientId: payload.clientId,
      companyId: payload.companyId,
      body: payload.body,
      title: payload.title,
      dueDate: payload.dueDate,
      isArchived: payload.isArchived,
      skipSubtaskCascade: payload.skipSubtaskCascade,
    }),
  })
  await assertOkResponse(response, 'Update task detail')
}

/**
 * Use the new update task function instead. This will be completely removed in the upcoming PRs.
 */
export const updateWorkflowStateIdOfTask = async (
  token: string,
  taskId: string,
  targetWorkflowStateId: string,
  skipSubtaskCascade?: boolean,
) => {
  const response = await fetch(await getInternalApiUrl(`/api/tasks/${taskId}?token=${token}`), {
    method: 'PATCH',
    headers: await jsonHeaders(),
    body: JSON.stringify({
      workflowStateId: targetWorkflowStateId,
      skipSubtaskCascade,
    }),
  })
  await assertOkResponse(response, 'Update task workflow state')
}

export const updateAssignee = async (
  token: string,
  task_id: string,
  internalUserId: string | null,
  clientId: string | null,
  companyId: string | null,
  associations?: Associations,
  isShared?: boolean,
) => {
  const response = await fetch(await getInternalApiUrl(`/api/tasks/${task_id}?token=${token}`), {
    method: 'PATCH',
    headers: await jsonHeaders(),
    body: JSON.stringify({
      internalUserId,
      clientId,
      companyId,
      ...(associations && { associations: clientId || companyId ? [] : associations }), // if assignee is not internal user, remove associations. Only include associations if viewer are changed. Not including viewer means not chaning the current state of associations in DB.
      isShared: isShared ?? undefined,
    }),
  })
  await assertOkResponse(response, 'Update task assignee')
}

export const clientUpdateTask = async (
  token: string,
  taskId: string,
  targetWorkflowStateId: string,
  skipSubtaskCascade?: boolean,
) => {
  const skipParam = skipSubtaskCascade ? '&skipSubtaskCascade=true' : ''
  const response = await fetch(
    await getInternalApiUrl(
      `/api/tasks/${taskId}/client?token=${token}&workflowStateId=${targetWorkflowStateId}${skipParam}`,
    ),
    {
      method: 'PATCH',
      headers: await getForwardedAssemblyHeaders(),
    },
  )
  await assertOkResponse(response, 'Update client task workflow state')
}

export const deleteTask = async (token: string, task_id: string) => {
  const response = await fetch(await getInternalApiUrl(`/api/tasks/${task_id}?token=${token}`), {
    method: 'DELETE',
    headers: await getForwardedAssemblyHeaders(),
  })
  await assertOkResponse(response, 'Delete task')
}

export const postAttachment = async (token: string, payload: CreateAttachmentRequest) => {
  const response = await fetch(await getInternalApiUrl(`/api/attachments?token=${token}`), {
    method: 'POST',
    headers: await jsonHeaders(),
    body: JSON.stringify(payload),
  })
  await assertOkResponse(response, 'Create attachment')
}

export const deleteAttachment = async (token: string, id: string) => {
  const response = await fetch(await getInternalApiUrl(`/api/attachments/${id}/?token=${token}`), {
    method: 'DELETE',
  })
  await assertOkResponse(response, 'Delete attachment')
}

export const postComment = async (token: string, payload: CreateComment) => {
  const res = await fetch(await getInternalApiUrl(`/api/comments?token=${token}`), {
    method: 'POST',
    headers: await jsonHeaders(),
    body: JSON.stringify(payload),
  })
  const data = await parseJsonResponse<{ comment: ActionComment }>(res, 'Create comment')
  return data.comment
}

export const updateComment = async (token: string, id: string, payload: UpdateComment) => {
  const res = await fetch(await getInternalApiUrl(`/api/comments/${id}?token=${token}`), {
    method: 'PATCH',
    headers: await jsonHeaders(),
    body: JSON.stringify(payload),
  })
  const data = await parseJsonResponse<{ comment: ActionComment }>(res, 'Update comment')
  return data.comment
}

export const deleteComment = async (token: string, id: string) => {
  const response = await fetch(await getInternalApiUrl(`/api/comments/${id}?token=${token}`), {
    method: 'DELETE',
  })
  await assertOkResponse(response, 'Delete comment')
}

export const postScrapMedia = async (token: string, payload: ScrapMediaRequest) => {
  const response = await fetch(await getInternalApiUrl(`/api/scrap-medias/?token=${token}`), {
    method: 'POST',
    headers: await jsonHeaders(),
    body: JSON.stringify(payload),
  })
  await assertOkResponse(response, 'Create scrap media')
}
