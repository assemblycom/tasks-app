// Server-side data loaders for the task detail page.
//
// Each loader calls service methods directly in-process instead of
// HTTP-looping back through our own /api routes. Compared to the prior
// `fetch(`${apiUrl}/api/...`)` pattern this:
//
//   - Collapses 5 separate Vercel function invocations into 1
//   - Lets `react.cache` deduplicate Copilot calls across loaders (each
//     /api invocation had its own request scope, so dedup couldn't span them)
//   - Removes the HTTP hop entirely
//
// Authentication is hoisted to the page so all loaders share a single
// `authenticateWithToken` call (one Copilot `getTokenPayload` round-trip).
//
// We still pass each loader's result through `toJsonSafe` so the shape
// matches what the HTTP API used to return (Prisma `Date` instances
// become ISO strings, `undefined`s drop). Downstream Redux/types already
// expect that JSON-stringified shape — keeping it avoids "non-serializable
// value in action" warnings and stays consistent with the `TaskResponse`
// schema (which types date fields as `z.string().datetime()`).

import APIError from '@api/core/exceptions/api'
import User from '@api/core/models/User.model'
import { SubtaskService } from '@api/tasks/subtasks.service'
import { TasksService } from '@api/tasks/tasks.service'
import { ViewSettingsService } from '@api/view-settings/viewSettings.service'
import httpStatus from 'http-status'
import type { AncestorTaskResponse, SubTaskStatusResponse, TaskResponse } from '@/types/dto/tasks.dto'
import type { CreateViewSettingsDTO } from '@/types/dto/viewSettings.dto'

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

// Loaders that run in parallel with `loadTask` must not reject when the task
// row is missing (hard-deleted or bad id). Otherwise `Promise.all` rejects
// before the page's `if (!task)` guard runs and the user sees an unhandled
// error instead of `DeletedRedirectPage`. `getTraversalPath` throws 404 and
// `getSubtaskCounts` throws 500 ("Path for task was not set") in that case —
// swallow them and return safe defaults; the canonical "missing task" signal
// is `loadTask` returning null, which still triggers the redirect.
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
    if (err instanceof APIError) return { count: 0, canCreateSubtask: false }
    throw err
  }
}

export const loadViewSettings = async (user: User): Promise<CreateViewSettingsDTO> =>
  toJsonSafe(await new ViewSettingsService(user).getViewSettingsForUser()) as unknown as CreateViewSettingsDTO
