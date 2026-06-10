import APIError from '@api/core/exceptions/api'
import User from '@api/core/models/User.model'
import { SubtaskService } from '@api/tasks/subtasks.service'
import { TasksService } from '@api/tasks/tasks.service'
import { ViewSettingsService } from '@api/view-settings/viewSettings.service'
import httpStatus from 'http-status'
import type { AncestorTaskResponse, SubTaskStatusResponse, TaskResponse } from '@/types/dto/tasks.dto'
import type { ViewSettingsResponse } from '@/types/dto/viewSettings.dto'

// this is needed since we are no longer making api round trip our dates are actual dates when we need it as string.
const toJsonSafe = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const loadTask = async (user: User, taskId: string): Promise<TaskResponse | null> => {
  try {
    const task = await new TasksService(user).getOneTask(taskId)
    return toJsonSafe(task) as unknown as TaskResponse
  } catch (err) {
    if (err instanceof APIError && err.status === httpStatus.NOT_FOUND) return null
    throw err
  }
}

export const loadTaskPath = async (user: User, taskId: string): Promise<AncestorTaskResponse[]> => {
  try {
    return toJsonSafe(await new TasksService(user).getTraversalPath(taskId))
  } catch (err) {
    if (err instanceof APIError && err.status === httpStatus.NOT_FOUND) return []
    throw err
  }
}

export const loadSubtaskStatus = async (user: User, taskId: string): Promise<SubTaskStatusResponse> => {
  try {
    return await new SubtaskService(user).getSubtaskStatus(taskId)
  } catch (err) {
    if (err instanceof APIError && err.status === httpStatus.NOT_FOUND) return { count: 0, canCreateSubtask: false }
    throw err
  }
}

export const loadViewSettings = async (user: User): Promise<ViewSettingsResponse> =>
  toJsonSafe(await new ViewSettingsService(user).getViewSettingsForUser()) as unknown as ViewSettingsResponse
