// Server-side data loaders for the task detail page.
//
// Each loader calls service methods directly in-process instead of
// HTTP-looping back through our own /api routes. Compared to the prior
// `fetch(`${apiUrl}/api/...`)` pattern this:
//
//   - Collapses 5 separate Vercel function invocations into 1
//   - Lets `react.cache` deduplicate Copilot calls across loaders (each
//     /api invocation had its own request scope, so dedup couldn't span them)
//   - Removes serialization/deserialization at the HTTP boundary
//
// Authentication is hoisted to the page so all loaders share a single
// `authenticateWithToken` call (one Copilot `getTokenPayload` round-trip).

import APIError from '@api/core/exceptions/api'
import User from '@api/core/models/User.model'
import { SubtaskService } from '@api/tasks/subtasks.service'
import { TasksService } from '@api/tasks/tasks.service'
import { ViewSettingsService } from '@api/view-settings/viewSettings.service'
import httpStatus from 'http-status'
import type { AncestorTaskResponse, SubTaskStatusResponse, TaskResponse } from '@/types/dto/tasks.dto'
import type { CreateViewSettingsDTO } from '@/types/dto/viewSettings.dto'

export const loadTask = async (user: User, taskId: string): Promise<TaskResponse | null> => {
  try {
    return (await new TasksService(user).getOneTask(taskId)) as unknown as TaskResponse
  } catch (err) {
    if (err instanceof APIError && err.status === httpStatus.NOT_FOUND) return null
    throw err
  }
}

export const loadTaskPath = (user: User, taskId: string): Promise<AncestorTaskResponse[]> =>
  new TasksService(user).getTraversalPath(taskId)

export const loadSubtaskStatus = (user: User, taskId: string): Promise<SubTaskStatusResponse> =>
  new SubtaskService(user).getSubtaskStatus(taskId)

export const loadViewSettings = (user: User): Promise<CreateViewSettingsDTO> =>
  new ViewSettingsService(user).getViewSettingsForUser() as unknown as Promise<CreateViewSettingsDTO>
