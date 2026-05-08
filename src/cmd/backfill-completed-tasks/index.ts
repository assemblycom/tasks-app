import DBClient from '@/lib/db'
import { ActivityType, AssigneeType, StateType } from '@prisma/client'

export const fillCompletedTasks = async () => {
  const db = DBClient.getInstance()
  const completedWorkflowStates = await db.workflowState.findMany({
    where: { type: StateType.completed },
  })
  if (!completedWorkflowStates.length) {
    throw new Error("No 'completed' workflow states found.")
  }
  for (const completedWorkflowState of completedWorkflowStates) {
    const tasks = await db.task.findMany({
      where: {
        workflowStateId: completedWorkflowState.id,
        OR: [{ completedBy: null }, { completedByUserType: null }],
      },
    })
    if (tasks.length === 0) {
      console.info('No tasks to backfill for completed workflow state:', completedWorkflowState.id)
      continue
    }
    const activityLogs = await db.activityLog.findMany({
      where: {
        taskId: { in: tasks.map((task) => task.id) },
        type: ActivityType.WORKFLOW_STATE_UPDATED,
      },
      orderBy: [{ taskId: 'asc' }, { createdAt: 'desc' }],
    })

    const activityLogMap = new Map<string, (typeof activityLogs)[0]>()
    for (const log of activityLogs) {
      if (!activityLogMap.has(log.taskId)) {
        activityLogMap.set(log.taskId, log)
      }
    }

    for (const [index, task] of tasks.entries()) {
      console.info(`🛠️ Backfilling task ${index + 1}/${tasks.length} (${task.id} - ${task.title})...`)

      const latestLog = activityLogMap.get(task.id)

      const fallbackUserId = task.createdById
      const fallbackUserType = AssigneeType.internalUser

      let completedBy = fallbackUserId
      let completedByUserType: AssigneeType = fallbackUserType

      if (
        latestLog &&
        typeof latestLog.details === 'object' &&
        latestLog.details !== null &&
        'newValue' in latestLog.details
      ) {
        const { newValue } = latestLog.details as { newValue: string }
        if (newValue === completedWorkflowState.id && latestLog.userId) {
          completedBy = latestLog.userId
          completedByUserType = latestLog.userRole
        }
      }

      await db.task.update({
        where: { id: task.id },
        data: {
          completedBy,
          completedByUserType,
        },
      })
    }
  }
}

fillCompletedTasks()
