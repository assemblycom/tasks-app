import { NotificationTaskActions } from '@/app/api/core/types/tasks'
import { UserRole } from '@/app/api/core/types/user'
import { getEmailDetails } from '@/app/api/notification/notification.helpers'
import { MAX_FETCH_ASSIGNEE_COUNT } from '@/constants/users'
import DBClient from '@/lib/db'
import { NotificationRequestBody } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { encodePayload } from '@/utils/crypto'
import { ActivityLog, ActivityType, ClientNotification, StateType, Task } from '@prisma/client'
import Bottleneck from 'bottleneck'

const db = DBClient.getInstance()

// dotenv is misbehaving inside tsx
const copilotAPIKey = process.env.COPILOT_API_KEY
if (!copilotAPIKey) {
  throw new Error(`
    ‼️ COPILOT_API_KEY is not set.
    💡 Source your .env manually, or run as COPILOT_API_KEY=<API_KEY> yarn tsx src/cmd/backfill-missed-emails!
  `)
}

// Bottleneck with 12req/s cap to be safe
const bottleneck = new Bottleneck({
  minTime: 250,
  maxConcurrent: 3,
})

// Dispatch email notifications through CopilotAPI and saves corrrsponding clientNotification in DB
const dispatchNotification = async (copilot: CopilotAPI, taskId: string, payload: NotificationRequestBody) => {
  // <<- Emails are triggered here. Proceed with caution ->>

  const notification = await copilot.createNotification(payload)
  if (!notification) {
    console.info('No notification resource returned for email-only delivery:', { taskId, payload })
    return
  }

  await db.clientNotification.create({
    data: {
      clientId: payload.recipientClientId!,
      companyId: payload.recipientCompanyId!,
      notificationId: notification.id,
      taskId,
    },
  })
}

// Fetchs tasks in error window between 2025-07-03T19:52:24Z (when we first saw an error log on NewRelic for tasks)
// and 2025-07-07T16:15:00Z (when copilot fixed the email issue)
const fetchTasksInErrorWindow = async () => {
  return db.task.findMany({
    where: {
      workflowState: { type: { not: StateType.completed } },
      createdAt: {
        gte: new Date('2025-07-03T19:52:24Z'),
        lte: new Date('2025-07-07T16:15:00Z'),
      },
      companyId: { not: null },
    },
  })
}

// Fetchs activity logs for the tasks in error window
const fetchActivityLogs = async (taskIds: string[]) => {
  return db.activityLog.findMany({
    where: {
      taskId: { in: taskIds },
      type: {
        in: [ActivityType.WORKFLOW_STATE_UPDATED, ActivityType.COMMENT_ADDED],
      },
      userRole: UserRole.Client,
    },
  })
}

// Fetchs notification logs for the tasks in error window
const fetchNotificationLogs = async (taskIds: string[]) => {
  return db.clientNotification.findMany({
    where: {
      taskId: { in: taskIds },
    },
  })
}

// Filters out tasks that have already been interacted with by clients, that are missing a notification
// We "figure out" if a client has interacted with a task by checking if there are any relevant activity logs for the task,
const filterMissedTasks = (tasks: Task[], activityLogs: ActivityLog[], notificationLogs: ClientNotification[]) => {
  return tasks.filter((task) => {
    const hasLogsForTask = (log: { taskId: string }) => log.taskId === task.id
    return !activityLogs.some(hasLogsForTask) && !notificationLogs.some(hasLogsForTask)
  })
}

// Dispatches missing email notifications for a workspace
const dispatchMissingEmailNotificationsForWorkspace = async (missedTasks: Task[], workspaceId: string) => {
  const internalUserId = missedTasks.find((t) => t.workspaceId === workspaceId)?.createdById
  if (!internalUserId) {
    console.error('No IU found for workspace:', workspaceId)
    return
  }

  const iuToken = encodePayload(copilotAPIKey, { internalUserId, workspaceId })
  const copilot = new CopilotAPI(iuToken)
  const [clients, workspace] = await Promise.all([
    copilot.getClients({ limit: MAX_FETCH_ASSIGNEE_COUNT }),
    copilot.getWorkspace(),
  ])

  const numClients = clients.data?.length || 0
  const workspaceClientTasks = missedTasks.filter((t) => t.workspaceId === workspaceId && t.clientId)
  const workspaceCompanyTasks = missedTasks.filter((t) => t.workspaceId === workspaceId && t.companyId && !t.clientId)

  const notificationDispatchPromises = []

  console.info('Dispatching missing email notifications for workspace:', workspaceId)
  let workspaceActualNotifications = 0

  // Don't use TaskNotificationService directly since it dispatches inProduct + email notifications
  // Instead, dispatch email notifications only, directly using CopilotAPI#createNotification
  for (const task of workspaceClientTasks) {
    const requestBody = {
      senderId: task.createdById,
      senderType: 'internalUser' as 'internalUser' | 'client',
      recipientClientId: task.clientId!,
      recipientCompanyId: task.companyId!,
      deliveryTargets: {
        email: getEmailDetails(workspace, task.createdById, task)[NotificationTaskActions.Assigned],
      },
    }
    notificationDispatchPromises.push(
      // Schedule to run parallelly with bottleneck
      (() => {
        workspaceActualNotifications++
        return bottleneck.schedule(() => dispatchNotification(copilot, task.id, requestBody))
      })(),
    )
  }

  for (const task of workspaceCompanyTasks) {
    const requestBodies =
      clients.data?.map((client) => ({
        senderId: task.createdById,
        senderType: 'internalUser' as 'internalUser' | 'client',
        recipientClientId: client.id,
        recipientCompanyId: client.companyId,
        deliveryTargets: {
          email: getEmailDetails(workspace, task.createdById, task)[NotificationTaskActions.AssignedToCompany],
        },
      })) || []

    workspaceActualNotifications += requestBodies.length
    notificationDispatchPromises.push(
      // Schedule to run parallelly with bottleneck
      requestBodies.map((body) => bottleneck.schedule(() => dispatchNotification(copilot, task.id, body))),
    )
  }

  // Run bottlenecked promises
  console.info(
    '🚨 Expected notifications in workspace:',
    workspaceClientTasks.length + workspaceCompanyTasks.length * numClients,
  )
  console.info('🚨 Actual notifications in workspace:', workspaceActualNotifications)

  await Promise.all(notificationDispatchPromises)
}

const run = async () => {
  if (1 === 1) {
    console.error("You shouldn't be doing this")
    return
  }

  // 1. Fetch tasks in error windw
  const tasks = await fetchTasksInErrorWindow()
  if (!tasks.length) {
    console.info('No tasks found in error window.')
    return
  }
  const taskIds = tasks.map((t: Task) => t.id)

  // 2. Fetch activity logs
  const activityLogs = await fetchActivityLogs(taskIds)

  // 3. Fetch notification logs
  const notificationLogs = await fetchNotificationLogs(taskIds)

  // 4. Filter missed tasks
  const missedTasks = filterMissedTasks(tasks, activityLogs, notificationLogs)
  if (!missedTasks.length) {
    console.info('No missed tasks found. Hurray!')
    return
  }

  // 5. Dispatch missing email notifications
  console.info('Missed tasks:', missedTasks.length)
  const affectedWorkspaces = new Set(missedTasks.map((t) => t.workspaceId))
  console.info('Missed workspaces:', Array.from(affectedWorkspaces))

  for (const workspaceId of affectedWorkspaces) {
    await dispatchMissingEmailNotificationsForWorkspace(missedTasks, workspaceId)
  }
}

run()
