export const fetchCache = 'force-no-store'

import { createMultipleAttachments } from '@/app/(home)/actions'
import { AssigneeCacheGetter } from '@/app/_cache/AssigneeCacheGetter'
import { AllTasksFetcher } from '@/app/_fetchers/AllTasksFetcher'
import { authenticatePage, loadTasks, loadViewSettings, loadWorkflowStates } from '@/app/_fetchers/loaders'
import { TemplatesFetcher } from '@/app/_fetchers/TemplatesFetcher'
import { ValidateNotificationCountFetcher } from '@/app/_fetchers/ValidateNotificationCountFetcher'
import { ModalNewTaskForm } from '@/app/ui/Modal_NewTaskForm'
import { TaskBoard } from '@/app/ui/TaskBoard'
import { TaskBoardAppBridge } from '@/app/ui/TaskBoardAppBridge'
import { SilentError } from '@/components/templates/SilentError'
import { ClientSideStateUpdate } from '@/hoc/ClientSideStateUpdate'
import { RealTime } from '@/hoc/RealTime'
import { UrlActionParamsType } from '@/types/common'
import { CreateAttachmentRequest } from '@/types/dto/attachments.dto'
import { UserType } from '@/types/interfaces'
import { getPreviewMode } from '@/utils/previewMode'
import { redirectIfTaskCta } from '@/utils/redirect'
import { UserRole } from '@api/core/types/user'
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
  const { user, tokenPayload } = await authenticatePage(token)
  const [workflowStates, tasks, viewSettings] = await Promise.all([
    loadWorkflowStates(user),
    loadTasks({ user }),
    loadViewSettings(user),
  ])

  const previewMode = getPreviewMode(tokenPayload)

  console.info(`app/client/page.tsx | Serving user ${token} with payload`, tokenPayload)

  return (
    <>
      <Suspense>{!previewMode && <ValidateNotificationCountFetcher user={user} />}</Suspense>
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
        action={searchParams?.action}
        pf={searchParams?.pf}
      >
        {/* Async fetchers */}
        <Suspense fallback={null}>{previewMode && <TemplatesFetcher user={user} />}</Suspense>
        <Suspense fallback={null}>
          <AllTasksFetcher user={user} />
        </Suspense>

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
