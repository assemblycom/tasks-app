import APIError from '@api/core/exceptions/api'
import User from '@api/core/models/User.model'
import { SubtaskService } from '@api/tasks/subtasks.service'
import { TasksService } from '@api/tasks/tasks.service'
import httpStatus from 'http-status'
import type { AncestorTaskResponse, SubTaskStatusResponse, TaskResponse } from '@/types/dto/tasks.dto'
import { toJsonSafe } from '@/app/_fetchers/loaders'

export const loadTask = async (user: User, taskId: string): Promise<TaskResponse | null> => {
  try {
    const task = await new TasksService(user).getOneTask(taskId)
    return toJsonSafe<TaskResponse>(task)
  } catch (err) {
    const nonRenderableStatuses: number[] = [httpStatus.NOT_FOUND, httpStatus.UNAUTHORIZED]
    if (err instanceof APIError && nonRenderableStatuses.includes(err.status)) return null
    throw err
  }
}

export const loadTaskPath = async (user: User, taskId: string): Promise<AncestorTaskResponse[]> => {
  try {
    return toJsonSafe<AncestorTaskResponse[]>(await new TasksService(user).getTraversalPath(taskId))
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
