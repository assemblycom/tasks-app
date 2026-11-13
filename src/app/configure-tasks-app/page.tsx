export const fetchCache = 'force-no-store'

import { TemplateBoard } from './ui/TemplateBoard'
import {
  authenticatePage,
  loadAssignees,
  loadTemplates,
  loadWorkflowStates,
  loadWorkspaceSettings,
} from '@/app/_fetchers/loaders'
import { addTypeToAssignee } from '@/utils/addTypeToAssignee'
import { ClientSideStateUpdate } from '@/hoc/ClientSideStateUpdate'
import { createNewTemplate, deleteTemplate, editTemplate } from './actions'
import { CreateTemplateRequest, UpdateTemplateRequest } from '@/types/dto/templates.dto'
import { RealTimeTemplates } from '@/hoc/RealtimeTemplates'
import { ConfigureTasksAppBridge } from '@/app/configure-tasks-app/ui/ConfigureTasksAppBridge'
import { AutoArchiveSection } from '@/app/configure-tasks-app/ui/AutoArchiveSection'
import { ClientViewSettingsSection } from '@/app/configure-tasks-app/ui/ClientViewSettingsSection'
import { StatusCustomizationSection } from '@/app/configure-tasks-app/ui/StatusCustomizationSection'
import { Stack } from '@mui/material'

interface ConfigureTasksAppPageProps {
  searchParams: Promise<{
    token: string
  }>
}

export default async function ConfigureTasksAppPage(props: ConfigureTasksAppPageProps) {
  const searchParams = await props.searchParams
  const { token } = searchParams
  const { user, tokenPayload } = await authenticatePage(token)
  const [workflowStates, assignee, templates, workspaceSetting] = await Promise.all([
    loadWorkflowStates(user),
    loadAssignees(user).then(addTypeToAssignee),
    loadTemplates(user),
    loadWorkspaceSettings(user),
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
