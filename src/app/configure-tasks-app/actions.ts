'use server'
import { apiUrl } from '@/config'
import { CreateTemplateRequest, UpdateTemplateRequest } from '@/types/dto/templates.dto'
import { UpdateWorkspaceSettingsDTO } from '@/types/dto/workspaceSettings.dto'

export const createNewTemplate = async (token: string, payload: CreateTemplateRequest) => {
  const resp = await fetch(`${apiUrl}/api/tasks/templates?token=${token}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const { data } = await resp.json()
  return data
}

export const createSubTemplate = async (token: string, id: string, payload: CreateTemplateRequest) => {
  const resp = await fetch(`${apiUrl}/api/tasks/templates/${id}?token=${token}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const { data } = await resp.json()
  return data
}

export async function deleteTemplate(token: string, templateId: string) {
  await fetch(`${apiUrl}/api/tasks/templates/${templateId}?token=${token}`, {
    method: 'DELETE',
  })
}

export async function editTemplate(token: string, templateId: string, payload: UpdateTemplateRequest) {
  await fetch(`${apiUrl}/api/tasks/templates/${templateId}?token=${token}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function updateWorkspaceSettings(token: string, payload: UpdateWorkspaceSettingsDTO) {
  const resp = await fetch(`${apiUrl}/api/workspace-settings?token=${token}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    throw new Error(`Failed to update workspace settings: ${resp.status}`)
  }
  return await resp.json()
}
