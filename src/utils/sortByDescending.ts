import { StateType } from '@prisma/client'

interface BaseSortable {
  createdAt: string
  id: string
}

interface WithDueDate extends BaseSortable {
  dueDate?: string
}

interface WithSubtaskSort extends WithDueDate {
  workflowState?: { type: StateType }
}

const getTimestamp = (date: string | Date) => new Date(date).getTime()

const subtaskStatePriority: Record<StateType, number> = {
  [StateType.started]: 0,
  [StateType.unstarted]: 1,
  [StateType.completed]: 2,
  [StateType.backlog]: 3,
  [StateType.cancelled]: 4,
}

const UNKNOWN_STATE_PRIORITY = Number.MAX_SAFE_INTEGER

export const sortByDescendingOrder = <T extends BaseSortable, K extends keyof T = never>(
  items: T[],
  priorityKey?: K,
): T[] => {
  return [...items].sort((a, b) => {
    if (priorityKey) {
      const aVal = a[priorityKey] as unknown as string | undefined
      const bVal = b[priorityKey] as unknown as string | undefined

      if (aVal && !bVal) return -1
      if (bVal && !aVal) return 1
      if (aVal && bVal && aVal !== bVal) {
        return getTimestamp(aVal) - getTimestamp(bVal)
      }
    }

    const createdAtDiff = getTimestamp(b.createdAt) - getTimestamp(a.createdAt)
    return createdAtDiff !== 0 ? createdAtDiff : a.id.localeCompare(b.id)
  })
}

export const sortTaskByDescendingOrder = <T extends WithDueDate>(tasks: T[]) => sortByDescendingOrder(tasks, 'dueDate')

export const sortTemplatesByDescendingOrder = <T extends BaseSortable>(templates: T[]) => sortByDescendingOrder(templates)

export const sortSubtasksByPriority = <T extends WithSubtaskSort>(subtasks: T[]): T[] => {
  const priorityOf = (state?: { type: StateType }) =>
    state ? (subtaskStatePriority[state.type] ?? UNKNOWN_STATE_PRIORITY) : UNKNOWN_STATE_PRIORITY
  return [...subtasks].sort((a, b) => {
    const priorityDiff = priorityOf(a.workflowState) - priorityOf(b.workflowState)
    if (priorityDiff !== 0) return priorityDiff

    if (a.dueDate && !b.dueDate) return -1
    if (b.dueDate && !a.dueDate) return 1
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
      return getTimestamp(a.dueDate) - getTimestamp(b.dueDate)
    }

    const createdAtDiff = getTimestamp(a.createdAt) - getTimestamp(b.createdAt)
    return createdAtDiff !== 0 ? createdAtDiff : a.id.localeCompare(b.id)
  })
}
