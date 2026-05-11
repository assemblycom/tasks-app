import { StateType } from '@prisma/client'

export const DEFAULT_WORKFLOW_STATE_NAMES: Record<StateType, string> = {
  unstarted: 'To Do',
  started: 'In Progress',
  completed: 'Done',
  backlog: 'Backlog',
  cancelled: 'Cancelled',
}
