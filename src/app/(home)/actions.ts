'use server'

import { apiUrl } from '@/config'
import { CreateAttachmentRequest } from '@/types/dto/attachments.dto'
import { CreateTaskRequest, UpdateTaskRequest } from '@/types/dto/tasks.dto'
import { CreateViewSettingsDTO } from '@/types/dto/viewSettings.dto'
import { ISignedUrlUpload } from '@/types/interfaces'
import { getForwardedAssemblyHeaders } from '@/utils/serverHeaders'

type ApiErrorResponse = {
  error?: unknown
}

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : 'Unknown error'
}

const getApiErrorMessage = (data: unknown, fallback: string) => {
  if (data && typeof data === 'object' && 'error' in data) {
    const error = (data as ApiErrorResponse).error
    if (typeof error === 'string') return error
  }

  return fallback
}

const parseJsonResponse = async <T>(response: Response): Promise<T | undefined> => {
  const text = await response.text()
  if (!text) return undefined

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Expected JSON response but received status ${response.status}`)
  }
}

const parseApiResponse = async <T>(response: Response, fallbackErrorMessage: string): Promise<T | undefined> => {
  const data = await parseJsonResponse<T | ApiErrorResponse>(response)
  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, `${fallbackErrorMessage} (${response.status})`))
  }

  return data as T | undefined
}

export const handleCreate = async (
  token: string,
  payload: CreateTaskRequest,
  opts?: { disableSubtaskTemplates?: boolean },
) => {
  try {
    const response = await fetch(
      `${apiUrl}/api/tasks?token=${token}&disableSubtaskTemplates=${opts?.disableSubtaskTemplates}`,
      {
        method: 'POST',
        headers: await getForwardedAssemblyHeaders(),
        body: JSON.stringify(payload),
      },
    )

    return await parseApiResponse(response, 'Failed to create task')
  } catch (e: unknown) {
    console.error('Something went wrong while creating task!', e)
    return { error: getErrorMessage(e) }
  }
}

export const updateTask = async ({
  token,
  taskId,
  payload,
}: {
  token: string
  taskId: string
  payload: UpdateTaskRequest
}) => {
  try {
    const response = await fetch(`${apiUrl}/api/tasks/${taskId}?token=${token}`, {
      method: 'PATCH',
      headers: await getForwardedAssemblyHeaders(),
      body: JSON.stringify({
        workflowStateId: payload.workflowStateId,
        internalUserId: payload.internalUserId,
        clientId: payload.clientId,
        companyId: payload.companyId,
        body: payload.body,
        title: payload.title,
        dueDate: payload.dueDate,
        skipSubtaskCascade: payload.skipSubtaskCascade,
      }),
    })

    await parseApiResponse(response, 'Failed to update task')
  } catch (e: unknown) {
    console.error('Something went wrong while updating task!', e)
  }
}

export const updateViewModeSettings = async (token: string, payload: CreateViewSettingsDTO) => {
  try {
    const response = await fetch(`${apiUrl}/api/view-settings?token=${token}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })

    await parseApiResponse(response, 'Failed to update view settings')
  } catch (e: unknown) {
    console.error('Something went wrong while updating view settings!', e)
  }
}

export const createMultipleAttachments = async (token: string, attachments: CreateAttachmentRequest[]) => {
  try {
    const response = await fetch(`${apiUrl}/api/attachments/bulk?token=${token}`, {
      method: 'POST',
      body: JSON.stringify(attachments),
    })

    await parseApiResponse(response, 'Failed to create attachments')
  } catch (e: unknown) {
    console.error('Something went wrong while creating attachments!', e)
  }
}

export async function getSignedUrlUpload(token: string, fileName: string, filePath: string) {
  try {
    const res = await fetch(
      `${apiUrl}/api/attachments/upload?token=${token}&fileName=${encodeURIComponent(fileName)}&filePath=${encodeURIComponent(filePath)}`,
    )

    const data = await parseApiResponse<{ signedUrl?: ISignedUrlUpload }>(res, 'Failed to get upload URL')
    return data?.signedUrl
  } catch (e: unknown) {
    console.error('Something went wrong while getting upload URL!', e)
  }
}

export const getSignedUrlFile = async (token: string, filePath: string) => {
  try {
    const res = await fetch(`${apiUrl}/api/attachments/sign-url?token=${token}&filePath=${encodeURIComponent(filePath)}`)
    const data = await parseApiResponse<{ signedUrl?: string }>(res, 'Failed to get file URL')
    return data?.signedUrl
  } catch (e: unknown) {
    console.error('Something went wrong while getting file URL!', e)
  }
}
