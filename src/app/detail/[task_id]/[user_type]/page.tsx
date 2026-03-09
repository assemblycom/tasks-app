export const fetchCache = 'force-no-store'

import { AssigneeCacheGetter } from '@/app/_cache/AssigneeCacheGetter'
import { AssigneeFetcher } from '@/app/_fetchers/AssigneeFetcher'
import { fetchWithErrorHandler } from '@/app/_fetchers/fetchWithErrorHandler'
import { OneTaskDataFetcher } from '@/app/_fetchers/OneTaskDataFetcher'
import { TemplatesFetcher } from '@/app/_fetchers/TemplatesFetcher'
import { WorkflowStateFetcher } from '@/app/_fetchers/WorkflowStateFetcher'
import { UserRole } from '@/app/api/core/types/user'
import {
  clientUpdateTask,
  deleteAttachment,
  deleteTask,
  postAttachment,
  updateAssignee,
  updateTaskDetail,
  updateWorkflowStateIdOfTask,
} from '@/app/detail/[task_id]/[user_type]/actions'
import { DetailStateUpdate } from '@/app/detail/[task_id]/[user_type]/DetailStateUpdate'
import { ActivityWrapper } from '@/app/detail/ui/ActivityWrapper'
import { ArchiveWrapper } from '@/app/detail/ui/ArchiveWrapper'
import { LastArchivedField } from '@/app/detail/ui/LastArchiveField'
import { MenuBoxContainer } from '@/app/detail/ui/MenuBoxContainer'
import { ResponsiveStack } from '@/app/detail/ui/ResponsiveStack'
import { Sidebar } from '@/app/detail/ui/Sidebar'
import { StyledBox, StyledTiptapDescriptionWrapper, TaskDetailsContainer } from '@/app/detail/ui/styledComponent'
import { Subtasks } from '@/app/detail/ui/Subtasks'
import { TaskEditor } from '@/app/detail/ui/TaskEditor'
import { DeletedRedirectPage } from '@/components/layouts/DeletedRedirectPage'
import { HeaderBreadcrumbs } from '@/components/layouts/HeaderBreadcrumbs'
import { SilentError } from '@/components/templates/SilentError'
import { apiUrl } from '@/config'
import { AppMargin, SizeofAppMargin } from '@/hoc/AppMargin'
import { AttachmentProvider } from '@/hoc/PostAttachmentProvider'
import { RealTime } from '@/hoc/RealTime'
import { RealTimeTemplates } from '@/hoc/RealtimeTemplates'
import { WorkspaceResponse } from '@/types/common'
import { AncestorTaskResponse, SubTaskStatusResponse, TaskResponse } from '@/types/dto/tasks.dto'
import { UserType } from '@/types/interfaces'
import { getAssigneeCacheLookupKey, UserIdsWithAssociationSharedType } from '@/utils/assignee'
import { CopilotAPI } from '@/utils/CopilotAPI'
import EscapeHandler from '@/utils/escapeHandler'
import { getPreviewMode } from '@/utils/previewMode'
import { checkIfTaskViewer } from '@/utils/taskViewer'
import { Box, Stack } from '@mui/material'
import { Suspense } from 'react'
import { z } from 'zod'

async function getOneTask(token: string, taskId: string): Promise<TaskResponse | null> {
  try {
    const data = await fetchWithErrorHandler<{ task: TaskResponse }>(`${apiUrl}/api/tasks/${taskId}?token=${token}`, {
      cache: 'no-store',
    })
    return data.task
  } catch (error) {
    if (error instanceof Error && error.message.includes('(404)')) {
      //the message surely includes 404 if the task is not found.
      return null
    }
    throw error
  }
}

async function getWorkspace(token: string): Promise<WorkspaceResponse> {
  const copilot = new CopilotAPI(token)
  return await copilot.getWorkspace()
}

async function getSubTasksStatus(token: string, taskId: string): Promise<SubTaskStatusResponse> {
  const res = await fetch(`${apiUrl}/api/tasks/${taskId}/subtask-count?token=${token}`, {})
  const data = await res.json()
  return data
}

async function getTaskPath(token: string, taskId: string): Promise<AncestorTaskResponse[]> {
  const res = await fetch(`${apiUrl}/api/tasks/${taskId}/path?token=${token}`)
  const { path } = await res.json()
  return path
}

export default async function TaskDetailPage(props: {
  params: Promise<{ task_id: string; task_name: string; user_type: UserType }>
  searchParams: Promise<{ token: string; isRedirect?: string; fromNotificationCenter?: string }>
}) {
  const searchParams = await props.searchParams
  const params = await props.params
  const { token } = searchParams
  const { task_id, user_type } = params

  if (z.string().safeParse(token).error) {
    return <SilentError message="Please provide a Valid Token" />
  }

  const copilotClient = new CopilotAPI(token)

  const [task, tokenPayload, workspace, subTaskStatus, taskPath] = await Promise.all([
    getOneTask(token, task_id),
    copilotClient.getTokenPayload(),
    getWorkspace(token),
    getSubTasksStatus(token, task_id),
    getTaskPath(token, task_id),
  ])

  if (!tokenPayload) {
    throw new Error('Please provide a Valid Token')
  }
  const fromNotificationCenter = !!searchParams.fromNotificationCenter

  console.info(`app/detail/${task_id}/${user_type}/page.tsx | Serving user ${token} with payload`, tokenPayload)
  if (!task) {
    return (
      <DeletedRedirectPage
        userType={tokenPayload.companyId ? UserRole.Client : UserRole.IU}
        token={token}
        fromNotificationCenter={fromNotificationCenter}
      />
    )
  }

  const isPreviewMode = !!getPreviewMode(tokenPayload)

  const breadcrumbItems: { label: string; href: string }[] = taskPath.map(({ label, id }) => ({
    label,
    href: `/detail/${id}/${user_type}?token=${token}`,
  }))

  // flag that determines if the current user is the task viewer
  const isViewer = checkIfTaskViewer(task.associations, tokenPayload)

  return (
    <DetailStateUpdate
      isRedirect={!!searchParams.isRedirect}
      token={token}
      tokenPayload={tokenPayload}
      task={task}
      workspace={workspace}
    >
      {token && <OneTaskDataFetcher token={token} task_id={task_id} initialTask={task} />}
      <Suspense fallback={null}>
        <TemplatesFetcher token={token} />
      </Suspense>
      <RealTime tokenPayload={tokenPayload}>
        <RealTimeTemplates tokenPayload={tokenPayload} token={token}>
          <EscapeHandler />
          <ResponsiveStack fromNotificationCenter={fromNotificationCenter}>
            <Box sx={{ width: '100%', display: 'flex', flex: 1, flexDirection: 'column', overflow: 'auto' }}>
              {isPreviewMode ? (
                <StyledBox>
                  <AppMargin size={SizeofAppMargin.HEADER} py="17.5px">
                    <Stack direction="row" justifyContent="space-between">
                      <HeaderBreadcrumbs token={token} items={breadcrumbItems} userType={params.user_type} />
                      <Stack direction="row" alignItems="center" columnGap="8px">
                        <MenuBoxContainer role={tokenPayload.internalUserId ? UserRole.IU : UserRole.Client} />
                        <Stack direction="row" alignItems="center" columnGap="8px">
                          <ArchiveWrapper taskId={task_id} userType={user_type} />
                        </Stack>
                      </Stack>
                    </Stack>
                  </AppMargin>
                </StyledBox>
              ) : (
                <>
                  <HeaderBreadcrumbs
                    token={token}
                    items={breadcrumbItems}
                    userType={params.user_type}
                    portalUrl={workspace.portalUrl}
                  />
                  <ArchiveWrapper taskId={task_id} userType={user_type} />
                </>
              )}

              <TaskDetailsContainer
                sx={{
                  padding: { xs: '20px 16px ', sm: '30px 20px' },
                }}
              >
                <StyledTiptapDescriptionWrapper>
                  <LastArchivedField />
                  <TaskEditor
                    // attachment={attachments}
                    task_id={task_id}
                    task={task}
                    isEditable={params.user_type === UserType.INTERNAL_USER || !!getPreviewMode(tokenPayload)}
                    updateTaskDetail={async (detail) => {
                      'use server'
                      await updateTaskDetail({ token, taskId: task_id, payload: { body: detail } })
                    }}
                    updateTaskTitle={async (title) => {
                      'use server'
                      title.trim() != '' && (await updateTaskDetail({ token, taskId: task_id, payload: { title } }))
                    }}
                    deleteTask={async () => {
                      'use server'
                      await deleteTask(token, task_id)
                    }}
                    postAttachment={async (postAttachmentPayload) => {
                      'use server'
                      await postAttachment(token, postAttachmentPayload)
                    }}
                    deleteAttachment={async (id: string) => {
                      'use server'
                      await deleteAttachment(token, id)
                    }}
                    userType={params.user_type}
                    token={token}
                  />
                </StyledTiptapDescriptionWrapper>
                {subTaskStatus.canCreateSubtask && (
                  <Subtasks
                    task_id={task_id}
                    token={token}
                    userType={tokenPayload.internalUserId ? UserRole.IU : UserRole.Client}
                    canCreateSubtasks={params.user_type === UserType.INTERNAL_USER || !!getPreviewMode(tokenPayload)}
                  />
                )}
                <AttachmentProvider
                  postAttachment={async (postAttachmentPayload) => {
                    'use server'
                    await postAttachment(token, postAttachmentPayload)
                  }}
                >
                  <ActivityWrapper task_id={task_id} token={token} tokenPayload={tokenPayload} />
                </AttachmentProvider>
              </TaskDetailsContainer>
            </Box>
            <Box
              {...(fromNotificationCenter
                ? {
                    sx: {
                      display: 'flex',
                      overflow: 'hidden',
                      justifyContent: 'center',
                      alignItems: 'center',
                    },
                  }
                : {})}
            >
              <AssigneeCacheGetter lookupKey={getAssigneeCacheLookupKey(user_type, tokenPayload, isPreviewMode)} />
              <AssigneeFetcher
                token={token}
                userType={params.user_type}
                isPreview={!!getPreviewMode(tokenPayload)}
                task={task}
                tokenPayload={tokenPayload}
              />
              <WorkflowStateFetcher token={token} task={task} />
              <Sidebar
                task_id={task_id}
                selectedAssigneeId={task?.assigneeId}
                userType={user_type}
                portalUrl={workspace.portalUrl}
                selectedWorkflowState={task?.workflowState}
                updateWorkflowState={async (workflowState) => {
                  'use server'
                  params.user_type === UserType.CLIENT_USER && !getPreviewMode(tokenPayload)
                    ? await clientUpdateTask(token, task_id, workflowState.id)
                    : await updateWorkflowStateIdOfTask(token, task_id, workflowState?.id)
                }}
                updateAssignee={async ({
                  internalUserId,
                  clientId,
                  companyId,
                  associations,
                  isShared,
                }: UserIdsWithAssociationSharedType) => {
                  'use server'
                  await updateAssignee(token, task_id, internalUserId, clientId, companyId, associations, isShared)
                }}
                updateTask={async (payload) => {
                  'use server'
                  await updateTaskDetail({ token, taskId: task_id, payload })
                }}
                disabled={params.user_type === UserType.CLIENT_USER}
                workflowDisabled={isViewer}
              />
            </Box>
          </ResponsiveStack>
        </RealTimeTemplates>
      </RealTime>
    </DetailStateUpdate>
  )
}
