import type { CreateViewSettingsDTO } from '@/types/dto/viewSettings.dto'
import type { TaskResponse } from '@/types/dto/tasks.dto'
import type { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import User from '@api/core/models/User.model'
import { TasksService } from '@api/tasks/tasks.service'
import { ViewSettingsService } from '@api/view-settings/viewSettings.service'
import WorkflowStatesService from '@api/workflow-states/workflowStates.service'

const toJsonSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const loadWorkflowStates = async (user: User): Promise<WorkflowStateResponse[]> =>
  toJsonSafe(await new WorkflowStatesService(user).getAllWorkflowStates())

export const loadViewSettings = async (user: User): Promise<CreateViewSettingsDTO> =>
  toJsonSafe(await new ViewSettingsService(user).getViewSettingsForUser()) as unknown as CreateViewSettingsDTO

export const loadBoardTasks = async (user: User): Promise<TaskResponse[]> =>
  toJsonSafe(
    await new TasksService(user).getAllTasks({
      showArchived: false,
      showUnarchived: true,
    }),
  ) as unknown as TaskResponse[]

export const loadAccessibleTasks = async (user: User): Promise<TaskResponse[]> =>
  toJsonSafe(
    await new TasksService(user).getAllTasks({
      all: true,
      showArchived: false,
      showUnarchived: true,
    }),
  ) as unknown as TaskResponse[]
