export const fetchCache = 'force-no-store'

import { TemplateBoard } from './ui/TemplateBoard'
import { apiUrl } from '@/config'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { IAssignee, ITemplate } from '@/types/interfaces'
import { addTypeToAssignee } from '@/utils/addTypeToAssignee'
import { ClientSideStateUpdate } from '@/hoc/ClientSideStateUpdate'
import { createNewTemplate, deleteTemplate, editTemplate } from './actions'
import { MAX_FETCH_ASSIGNEE_COUNT } from '@/constants/users'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { CreateTemplateRequest, UpdateTemplateRequest } from '@/types/dto/templates.dto'
import { RealTimeTemplates } from '@/hoc/RealtimeTemplates'
import { Token, TokenSchema } from '@/types/common'
import { ConfigureTasksAppBridge } from '@/app/configure-tasks-app/ui/ConfigureTasksAppBridge'
import { AutoArchiveSection } from '@/app/configure-tasks-app/ui/AutoArchiveSection'
import { ClientViewSettingsSection } from '@/app/configure-tasks-app/ui/ClientViewSettingsSection'
import { StatusCustomizationSection } from '@/app/configure-tasks-app/ui/StatusCustomizationSection'
import { ClientViewSettings } from '@/types/dto/workspaceSettings.dto'
import { Stack } from '@mui/material'

async function getAllWorkflowStates(token: string): Promise<WorkflowStateResponse[]> {
  const res = await fetch(`${apiUrl}/api/workflow-states?token=${token}`, {
    next: { tags: ['getAllWorkflowStates'] },
  })

  const data = await res.json()

  return data.workflowStates
}

async function getAssigneeList(token: string): Promise<IAssignee> {
  const res = await fetch(`${apiUrl}/api/users?token=${token}&limit=${MAX_FETCH_ASSIGNEE_COUNT}`, {
    next: { tags: ['getAssigneeList'] },
  })

  const data = await res.json()

  return data.users
}

async function getAllTemplates(token: string): Promise<ITemplate[]> {
  const res = await fetch(`${apiUrl}/api/tasks/templates?token=${token}`, {
    next: { tags: ['getAllTemplates'] },
  })
  const templates = await res.json()

  return templates.data
}

async function getTokenPayload(token: string): Promise<Token> {
  const copilotClient = new CopilotAPI(token)
  return TokenSchema.parse(await copilotClient.getTokenPayload())
}

async function getWorkspaceSetting(token: string): Promise<{ autoArchiveAfterDays: number } & ClientViewSettings> {
  const res = await fetch(`${apiUrl}/api/workspace-settings?token=${token}`, { cache: 'no-store' })
  return await res.json()
}

interface ConfigureTasksAppPageProps {
  searchParams: Promise<{
    token: string
  }>
}

export default async function ConfigureTasksAppPage(props: ConfigureTasksAppPageProps) {
  const searchParams = await props.searchParams
  const { token } = searchParams
  const [workflowStates, assignee, templates, tokenPayload, workspaceSetting] = await Promise.all([
    getAllWorkflowStates(token),
    addTypeToAssignee(await getAssigneeList(token)),
    getAllTemplates(token),
    getTokenPayload(token),
    getWorkspaceSetting(token),
  ])

  return (
    <ClientSideStateUpdate
      workflowStates={workflowStates}
      token={token}
      assignee={assignee}
      templates={templates}
      tokenPayload={tokenPayload}
    >
      <ConfigureTasksAppBridge />
      <RealTimeTemplates tokenPayload={tokenPayload} token={token}>
        <Stack direction="column" rowGap="32px" sx={{ paddingTop: '24px', paddingBottom: '12px', paddingX: '12px' }}>
          <AutoArchiveSection initialAutoArchiveAfterDays={workspaceSetting.autoArchiveAfterDays} token={token} />
          <ClientViewSettingsSection
            initialSettings={{
              clientDefaultViewMode: workspaceSetting.clientDefaultViewMode,
              clientHideSubtasks: workspaceSetting.clientHideSubtasks,
              clientViewSettingsLocked: workspaceSetting.clientViewSettingsLocked,
            }}
            token={token}
          />
          <StatusCustomizationSection initialWorkflowStates={workflowStates} token={token} />
          <TemplateBoard
            handleCreateTemplate={async (payload: CreateTemplateRequest) => {
              'use server'
              return await createNewTemplate(token, payload)
            }}
            handleDeleteTemplate={async (templateId: string) => {
              'use server'
              await deleteTemplate(token, templateId)
            }}
            handleEditTemplate={async (payload: UpdateTemplateRequest, templateId: string) => {
              'use server'
              await editTemplate(token, templateId, payload)
            }}
          />
        </Stack>
      </RealTimeTemplates>
    </ClientSideStateUpdate>
  )
}
