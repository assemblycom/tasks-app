export const fetchCache = 'force-no-store'

import { AppMargin, SizeofAppMargin } from '@/hoc/AppMargin'
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
import { Token, TokenSchema, WorkspaceResponse } from '@/types/common'
import { ManageTemplatesAppBridge } from '@/app/manage-templates/ui/ManageTemplatesAppBridge'
import { UserRole } from '@/app/api/core/types/user'

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
  const payload = TokenSchema.parse(await copilotClient.getTokenPayload())
  return payload
}

async function getWorkspace(token: string): Promise<WorkspaceResponse> {
  const copilot = new CopilotAPI(token)
  return await copilot.getWorkspace()
}

interface ManageTemplatesPageProps {
  searchParams: Promise<{
    token: string
  }>
}

export default async function ManageTemplatesPage(props: ManageTemplatesPageProps) {
  const searchParams = await props.searchParams
  const { token } = searchParams
  const [workflowStates, assignee, templates, tokenPayload, workspace] = await Promise.all([
    getAllWorkflowStates(token),
    addTypeToAssignee(await getAssigneeList(token)),
    getAllTemplates(token),
    getTokenPayload(token),
    getWorkspace(token),
  ])

  return (
    <ClientSideStateUpdate
      workflowStates={workflowStates}
      token={token}
      assignee={assignee}
      templates={templates}
      tokenPayload={tokenPayload}
    >
      <ManageTemplatesAppBridge token={token} role={UserRole.IU} />
      <RealTimeTemplates tokenPayload={tokenPayload} token={token}>
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
      </RealTimeTemplates>
    </ClientSideStateUpdate>
  )
}
