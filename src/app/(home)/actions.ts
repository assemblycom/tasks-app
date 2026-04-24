'use server'

import { apiUrl } from '@/config'
import { CreateAttachmentRequest } from '@/types/dto/attachments.dto'
import { CreateTaskRequest, UpdateTaskRequest } from '@/types/dto/tasks.dto'
import { CreateViewSettingsDTO } from '@/types/dto/viewSettings.dto'
import { getForwardedAssemblyHeaders } from '@/utils/serverHeaders'

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

    return await response.json()
  } catch (e: unknown) {
    console.error('Something went wrong while creating task!', e)
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
  await fetch(`${apiUrl}/api/tasks/${taskId}?token=${token}`, {
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
    }),
  })
}

export const updateViewModeSettings = async (token: string, payload: CreateViewSettingsDTO) => {
  await fetch(`${apiUrl}/api/view-settings?token=${token}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export const createMultipleAttachments = async (token: string, attachments: CreateAttachmentRequest[]) => {
  await fetch(`${apiUrl}/api/attachments/bulk?token=${token}`, {
    method: 'POST',
    body: JSON.stringify(attachments),
  })
}

export async function getSignedUrlUpload(token: string, fileName: string, filePath: string) {
  const res = await fetch(`${apiUrl}/api/attachments/upload?token=${token}&fileName=${fileName}&filePath=${filePath}`)

  const data = await res.json()
  return data.signedUrl
}

export const getSignedUrlFile = async (token: string, filePath: string) => {
  const res = await fetch(`${apiUrl}/api/attachments/sign-url?token=${token}&filePath=${filePath}`)
  const data = await res.json()
  return data.signedUrl
}
