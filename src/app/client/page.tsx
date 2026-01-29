export const fetchCache = 'force-no-store'

import { createMultipleAttachments } from '@/app/(home)/actions'
import { getViewSettings } from '@/app/(home)/page'
import { AssigneeCacheGetter } from '@/app/_cache/AssigneeCacheGetter'
import { AllTasksFetcher } from '@/app/_fetchers/AllTasksFetcher'
import { AssigneeFetcher } from '@/app/_fetchers/AssigneeFetcher'
import { TemplatesFetcher } from '@/app/_fetchers/TemplatesFetcher'
import { ValidateNotificationCountFetcher } from '@/app/_fetchers/ValidateNotificationCountFetcher'
import { ModalNewTaskForm } from '@/app/ui/Modal_NewTaskForm'
import { TaskBoard } from '@/app/ui/TaskBoard'
import { TaskBoardAppBridge } from '@/app/ui/TaskBoardAppBridge'
import { SilentError } from '@/components/templates/SilentError'
import { apiUrl } from '@/config'
import { ClientSideStateUpdate } from '@/hoc/ClientSideStateUpdate'
import { DndWrapper } from '@/hoc/DndWrapper'
import { RealTime } from '@/hoc/RealTime'
import { Token, TokenSchema, UrlActionParamsType, WorkspaceResponse } from '@/types/common'
import { CreateAttachmentRequest } from '@/types/dto/attachments.dto'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { UserType } from '@/types/interfaces'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { getPreviewMode } from '@/utils/previewMode'
import { redirectIfTaskCta } from '@/utils/redirect'
import { UserRole } from '@api/core/types/user'
import { Suspense } from 'react'
import { z } from 'zod'

export const maxDuration = 60 //just to be safe. the validate count job might take longer that 15 seconds(default max duration of server components) which will make the app crash. Increasing the duration to 60.

async function getAllWorkflowStates(token: string): Promise<WorkflowStateResponse[]> {
  const res = await fetch(`${apiUrl}/api/workflow-states?token=${token}`, {
    next: { tags: ['getAllWorkflowStates'] },
  })

  const data = await res.json()

  return data.workflowStates
}

async function getAllTasks(token: string): Promise<TaskResponse[]> {
  const res = await fetch(`${apiUrl}/api/tasks?token=${token}`)
  const data = await res.json()
  return data.tasks
}

async function getTokenPayload(token: string): Promise<Token> {
  const copilotClient = new CopilotAPI(token)
  const payload = TokenSchema.parse(await copilotClient.getTokenPayload())
  return payload as Token
}

async function getWorkspace(token: string): Promise<WorkspaceResponse> {
  const copilot = new CopilotAPI(token)
  return await copilot.getWorkspace()
}

export default async function ClientPage(props: { searchParams: Promise<{ token: string } & UrlActionParamsType> }) {
  const searchParams = await props.searchParams
  const token = searchParams.token
  if (!z.string().safeParse(token).success) {
    return <SilentError message="Please provide a Valid Token" />
  }
  redirectIfTaskCta(searchParams, UserType.CLIENT_USER)
  const [workflowStates, tasks, viewSettings, tokenPayload, workspace] = await Promise.all([
    getAllWorkflowStates(token),
    getAllTasks(token),
    getViewSettings(token),
    getTokenPayload(token),
    getWorkspace(token),
  ])

  const previewMode = getPreviewMode(tokenPayload)

  console.info(`app/client/page.tsx | Serving user ${token} with payload`, tokenPayload)

  return (
    <>
      <Suspense>{!previewMode && <ValidateNotificationCountFetcher token={token} />}</Suspense>
      <AssigneeCacheGetter
        lookupKey={`${!!previewMode ? tokenPayload.internalUserId : tokenPayload.clientId}.${tokenPayload.companyId}`}
      />
      <ClientSideStateUpdate
        workflowStates={workflowStates}
        tasks={tasks}
        token={token}
        tokenPayload={tokenPayload}
        viewSettings={viewSettings}
        clearExpandedComments={true}
        workspace={workspace}
        action={searchParams?.action}
        pf={searchParams?.pf}
      >
        {/* Async fetchers */}
        <Suspense fallback={null}>
          <AssigneeFetcher
            token={token}
            userType={previewMode ? UserType.INTERNAL_USER : UserType.CLIENT_USER}
            isPreview={!!getPreviewMode(tokenPayload)}
            tokenPayload={tokenPayload}
          />
        </Suspense>
        <Suspense fallback={null}>{previewMode && <TemplatesFetcher token={token} />}</Suspense>
        <Suspense fallback={null}>
          <AllTasksFetcher token={token} />
        </Suspense>

        <TaskBoardAppBridge token={token} role={UserRole.Client} portalUrl={workspace.portalUrl} />
        <RealTime tokenPayload={tokenPayload}>
          <DndWrapper>
            <TaskBoard mode={UserRole.Client} token={token} />
          </DndWrapper>
          <ModalNewTaskForm
            handleCreateMultipleAttachments={async (attachments: CreateAttachmentRequest[]) => {
              'use server'
              await createMultipleAttachments(token, attachments)
            }}
          />
        </RealTime>
      </ClientSideStateUpdate>
    </>
  )
}
