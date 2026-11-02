export const fetchCache = 'force-no-store'

import { createMultipleAttachments } from '@/app/(home)/actions'
import { AssigneeCacheGetter } from '@/app/_cache/AssigneeCacheGetter'
import {
  loadAccessibleTasks,
  loadBoardTasks,
  loadViewSettings,
  loadWorkflowStates,
} from '@/app/client/loaders'
import { TemplatesFetcher } from '@/app/_fetchers/TemplatesFetcher'
import { ValidateNotificationCountFetcher } from '@/app/_fetchers/ValidateNotificationCountFetcher'
import { ModalNewTaskForm } from '@/app/ui/Modal_NewTaskForm'
import { TaskBoard } from '@/app/ui/TaskBoard'
import { TaskBoardAppBridge } from '@/app/ui/TaskBoardAppBridge'
import { SilentError } from '@/components/templates/SilentError'
import { ClientSideStateUpdate } from '@/hoc/ClientSideStateUpdate'
import { RealTime } from '@/hoc/RealTime'
import { Token, UrlActionParamsType } from '@/types/common'
import { CreateAttachmentRequest } from '@/types/dto/attachments.dto'
import { UserType } from '@/types/interfaces'
import { getPreviewMode } from '@/utils/previewMode'
import { redirectIfTaskCta } from '@/utils/redirect'
import { UserRole } from '@api/core/types/user'
import { authenticateWithToken } from '@/app/api/core/utils/authenticate'
import { Suspense } from 'react'
import { z } from 'zod'

export const maxDuration = 300 //just to be safe. the validate count job might take longer that 15 seconds(default max duration of server components) which will make the app crash. Increasing the duration to 60.

export default async function ClientPage(props: { searchParams: Promise<{ token: string } & UrlActionParamsType> }) {
  const searchParams = await props.searchParams
  const token = searchParams.token
  if (!z.string().safeParse(token).success) {
    return <SilentError message="Please provide a Valid Token" />
  }
  redirectIfTaskCta(searchParams, UserType.CLIENT_USER)

  const user = await authenticateWithToken(token)
  const tokenPayload: Token = {
    internalUserId: user.internalUserId,
    clientId: user.clientId,
    companyId: user.companyId,
    workspaceId: user.workspaceId,
  }

  const [workflowStates, tasks, viewSettings, accessibleTasks] = await Promise.all([
    loadWorkflowStates(user),
    loadBoardTasks(user),
    loadViewSettings(user),
    loadAccessibleTasks(user),
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
        accessibleTasks={accessibleTasks}
        token={token}
        tokenPayload={tokenPayload}
        viewSettings={viewSettings}
        clearExpandedComments={true}
        action={searchParams?.action}
        pf={searchParams?.pf}
      >
        {/* Async fetchers */}
        <Suspense fallback={null}>{previewMode && <TemplatesFetcher token={token} />}</Suspense>

        <TaskBoardAppBridge token={token} role={UserRole.Client} />
        <RealTime tokenPayload={tokenPayload}>
          <TaskBoard mode={UserRole.Client} token={token} />
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
