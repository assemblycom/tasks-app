import { Token } from '@/types/common'
import type { TaskResponse } from '@/types/dto/tasks.dto'
import type { CreateViewSettingsDTO } from '@/types/dto/viewSettings.dto'
import type { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import type { ClientViewSettings } from '@/types/dto/workspaceSettings.dto'
import type { IAssignee, ITemplate } from '@/types/interfaces'
import { MAX_FETCH_ASSIGNEE_COUNT } from '@/constants/users'
import APIError from '@api/core/exceptions/api'
import User from '@api/core/models/User.model'
import { authenticateWithToken } from '@api/core/utils/authenticate'
import { TasksService } from '@api/tasks/tasks.service'
import { TemplatesService } from '@api/tasks/templates/templates.service'
import UsersService from '@api/users/users.service'
import { ViewSettingsService } from '@api/view-settings/viewSettings.service'
import WorkflowStatesService from '@api/workflow-states/workflowStates.service'
import { WorkspaceSettingsService } from '@api/workspace-settings/workspaceSettings.service'
import * as Sentry from '@sentry/nextjs'
import httpStatus from 'http-status'
import { cache } from 'react'

// Service results carry Date objects; the client expects the string dates an API response would have
export const toJsonSafe = <T>(value: unknown): T => JSON.parse(JSON.stringify(value)) as T

const traced = <T>({ name, user, fn }: { name: string; user: User; fn: () => Promise<T> }): Promise<T> =>
  Sentry.startSpan({ name, op: 'loader' }, async () => {
    const start = performance.now()
    const result = await fn()
    console.info(`loader ${name} | workspace ${user.workspaceId} | ${Math.round(performance.now() - start)}ms`)
    return result
  })

export const toTokenPayload = (user: User): Token => ({
  internalUserId: user.internalUserId,
  clientId: user.clientId,
  companyId: user.companyId,
  workspaceId: user.workspaceId,
})

export const authenticatePage = async (token: string) => {
  const user = await authenticateWithToken(token)
  return { user, tokenPayload: toTokenPayload(user) }
}

// Detail page's redirect flow loads these in both DetailStateUpdate and WorkflowStateFetcher
export const loadWorkflowStates = cache((user: User) =>
  traced({
    name: 'loadWorkflowStates',
    user,
    fn: async () => toJsonSafe<WorkflowStateResponse[]>(await new WorkflowStatesService(user).getAllWorkflowStates()),
  }),
)

export const loadTasks = ({
  user,
  showArchived = false,
  showUnarchived = true,
  all = false,
}: {
  user: User
  showArchived?: boolean
  showUnarchived?: boolean
  all?: boolean
}) =>
  traced({
    name: all ? 'loadAccessibleTasks' : 'loadTasks',
    user,
    fn: async () =>
      toJsonSafe<TaskResponse[]>(
        await new TasksService(user).getAllTasks({ showArchived, showUnarchived, all, parentId: null }),
      ),
  })

export const loadViewSettings = (user: User) =>
  traced({
    name: 'loadViewSettings',
    user,
    fn: async () => toJsonSafe<CreateViewSettingsDTO>(await new ViewSettingsService(user).getViewSettingsForUser()),
  })

export const loadTemplates = (user: User) =>
  traced({
    name: 'loadTemplates',
    user,
    fn: async () => toJsonSafe<ITemplate[]>(await new TemplatesService(user).getTaskTemplates()),
  })

export const loadTemplate = ({ user, id }: { user: User; id: string }) =>
  traced({
    name: 'loadTemplate',
    user,
    fn: async () => {
      try {
        return toJsonSafe<ITemplate>(await new TemplatesService(user).getOneTemplate(id))
      } catch (err) {
        const nonRenderableStatuses: number[] = [httpStatus.NOT_FOUND, httpStatus.UNAUTHORIZED]
        if (err instanceof APIError && nonRenderableStatuses.includes(err.status)) return null
        throw err
      }
    },
  })

export const loadAssignees = (user: User) =>
  traced({
    name: 'loadAssignees',
    user,
    fn: async () => toJsonSafe<IAssignee>(await new UsersService(user).getGroupedUsers(MAX_FETCH_ASSIGNEE_COUNT)),
  })

export const loadWorkspaceSettings = (user: User) =>
  traced({
    name: 'loadWorkspaceSettings',
    user,
    fn: async () =>
      toJsonSafe<{ autoArchiveAfterDays: number } & ClientViewSettings>(
        await new WorkspaceSettingsService(user).getWorkspaceSettings(),
      ),
  })
