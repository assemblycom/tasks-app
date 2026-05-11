// Server-side data loaders for the task detail page.
//
// Each loader calls service methods directly in-process instead of
// HTTP-looping back through our own /api routes. Compared to the prior
// `fetch(`${apiUrl}/api/...`)` pattern this:
//
//   - Collapses 5 separate Vercel function invocations into 1
//   - Lets `react.cache` deduplicate Copilot calls across loaders (each
//     /api invocation had its own request scope, so dedup couldn't span them)
//   - Skips redundant authenticate() round-trips
//   - Removes serialization/deserialization at the HTTP boundary

import { authenticateWithToken } from '@api/core/utils/authenticate'
import { TasksService } from '@api/tasks/tasks.service'
import { SubtaskService } from '@api/tasks/subtasks.service'
import { ViewSettingsService } from '@api/view-settings/viewSettings.service'
import type { AncestorTaskResponse, SubTaskStatusResponse, TaskResponse } from '@/types/dto/tasks.dto'
import type { CreateViewSettingsDTO } from '@/types/dto/viewSettings.dto'

export const loadTask = async (token: string, taskId: string): Promise<TaskResponse | null> => {
  const user = await authenticateWithToken(token)
  try {
    return (await new TasksService(user).getOneTask(taskId)) as unknown as TaskResponse
  } catch (err) {
    if (err instanceof Error && /404|not found/i.test(err.message)) return null
    throw err
  }
}

export const loadTaskPath = async (token: string, taskId: string): Promise<AncestorTaskResponse[]> => {
  const user = await authenticateWithToken(token)
  return new TasksService(user).getTraversalPath(taskId)
}

export const loadSubtaskStatus = async (token: string, taskId: string): Promise<SubTaskStatusResponse> => {
  const user = await authenticateWithToken(token)
  const count = await new SubtaskService(user).getSubtaskCounts(taskId)
  return { count, canCreateSubtask: count < 2 } as SubTaskStatusResponse
}

export const loadViewSettings = async (token: string): Promise<CreateViewSettingsDTO> => {
  const user = await authenticateWithToken(token)
  return (await new ViewSettingsService(user).getViewSettingsForUser()) as unknown as CreateViewSettingsDTO
}
