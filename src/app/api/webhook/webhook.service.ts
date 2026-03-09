import { MAX_FETCH_ASSIGNEE_COUNT } from '@/constants/users'
import { NotificationRequestBody } from '@/types/common'
import { ClientUpdatedEventData, HANDLEABLE_EVENT, WebhookEntitySchema, WebhookEvent, WebhookSchema } from '@/types/webhook'
import { getArrayDifference } from '@/utils/array'
import { copilotBottleneck, dbBottleneck } from '@/utils/bottleneck'
import APIError from '@api/core/exceptions/api'
import { BaseService } from '@api/core/services/base.service'
import { NotificationTaskActions } from '@api/core/types/tasks'
import { getInProductNotificationDetails } from '@api/notification/notification.helpers'
import { NotificationService } from '@api/notification/notification.service'
import { TasksService } from '@api/tasks/tasks.service'
import { AssigneeType, StateType } from '@prisma/client'
import httpStatus from 'http-status'
import { NextRequest } from 'next/server'

class WebhookService extends BaseService {
  async parseWebhook(req: NextRequest): Promise<WebhookEvent> {
    const webhookEvent = WebhookSchema.safeParse(await req.json())
    if (!webhookEvent.success) {
      throw new APIError(httpStatus.UNPROCESSABLE_ENTITY, 'Failed to parse webhook event', webhookEvent.error.issues)
    }
    return webhookEvent.data
  }

  validateHandleableEvent(webhookEvent: WebhookEvent): HANDLEABLE_EVENT | null {
    const eventType = webhookEvent.eventType as HANDLEABLE_EVENT
    const isValidWebhook = [
      HANDLEABLE_EVENT.InternalUserDeleted,
      HANDLEABLE_EVENT.ClientActivated,
      HANDLEABLE_EVENT.ClientUpdated,
      HANDLEABLE_EVENT.ClientDeleted,
      HANDLEABLE_EVENT.CompanyDeleted,
    ].includes(eventType)
    return isValidWebhook ? eventType : null
  }

  parseAssigneeData(webhookEvent: WebhookEvent, eventType: HANDLEABLE_EVENT) {
    const deletedEntity = WebhookEntitySchema.parse(webhookEvent.data)
    const assigneeId = deletedEntity.id
    const assigneeType = {
      [HANDLEABLE_EVENT.InternalUserDeleted]: AssigneeType.internalUser,
      [HANDLEABLE_EVENT.ClientActivated]: AssigneeType.client,
      [HANDLEABLE_EVENT.ClientUpdated]: AssigneeType.client,
      [HANDLEABLE_EVENT.ClientDeleted]: AssigneeType.client,
      [HANDLEABLE_EVENT.CompanyDeleted]: AssigneeType.company,
    }[eventType]

    return { assigneeId, assigneeType }
  }

  async handleClientCreated(clientId: string, forCompanyId?: string) {
    // First fetch all the current non-complete tasks for client's company, if exists
    const client = await this.copilot.getClient(clientId)
    let company
    try {
      // Accomodate indididual client's company id behavior for copilot
      // Note: When a client is created, only one company can be assigned to it.
      // This is why we don't need to check for multiple companies here.
      //
      // NOTE: forCompanyId is used when a client is created for a company that is not the first company in the client's companyIds array
      const companyId = forCompanyId || client.companyIds?.[0] || client.companyId
      company = await this.copilot.getCompany(companyId)
    } catch (e: unknown) {
      company = null
    }
    if (!company?.name) {
      console.info(
        `WebhookService#handleClientCreated :: Ignoring event for client that doesn't have a company (has placeholder company)`,
      )
      return
    }

    const tasksService = new TasksService(this.user)
    const tasks = await tasksService.getIncompleteTasksForCompany(company.id)
    if (!tasks.length) return

    // Then trigger appropriate notifications
    const createNotificationPromises = []

    const [workspace, internalUsersResponse] = await Promise.all([
      this.copilot.getWorkspace(),
      this.copilot.getInternalUsers({ limit: MAX_FETCH_ASSIGNEE_COUNT }),
    ])

    const internalUsers = internalUsersResponse.data
    const existingNotifications = await this.db.clientNotification.findMany({
      where: { clientId, companyId: company.id },
    })

    for (let task of tasks) {
      const actionUser = internalUsers.find((iu) => iu.id === task.createdById)
      if (!actionUser) {
        console.error(`WebhookService#handleClientCreated :: Could not get action user for company task ${task.id}`)
        continue
      }

      const existingNotification = existingNotifications.find((notification) => notification.taskId === task.id)
      if (existingNotification) continue

      const actionUserName = `${actionUser.givenName} ${actionUser.familyName}`
      const inProduct = task.companyId
        ? getInProductNotificationDetails(workspace, actionUserName, task, { companyName: company.name })[
            NotificationTaskActions.AssignedToCompany
          ]
        : getInProductNotificationDetails(workspace, actionUserName, task, { companyName: company.name })[
            NotificationTaskActions.SharedToCompany
          ]
      const notificationDetails: NotificationRequestBody = {
        senderId: task.createdById,
        senderType: 'internalUser',
        recipientClientId: clientId,
        recipientCompanyId: company.id,
        // If any of the given action is not present in details obj, that type of notification is not sent
        deliveryTargets: { inProduct },
      }
      createNotificationPromises.push(copilotBottleneck.schedule(() => this.copilot.createNotification(notificationDetails)))
    }
    const notifications = await Promise.all(createNotificationPromises)

    // Now add appropriate records to our ClientNotifications table
    const insertPromises = []
    const notificationService = new NotificationService(this.user)
    for (let i = 0; i < notifications.length; i++) {
      insertPromises.push(
        // This is assuming a 1:1 map for tasks and notifications
        dbBottleneck.schedule(() => notificationService.addToClientNotifications(tasks[i], notifications[i])),
      )
    }
    await Promise.all(insertPromises)
  }

  async handleUserDeleted(assigneeId: string, assigneeType: AssigneeType) {
    const tasksService = new TasksService(this.user)
    // Delete corresponding tasks
    console.info(`WebhookService#handleUserDeleted :: Deleting all tasks for ${assigneeType} ${assigneeId}`)
    const tasks = await tasksService.deleteAllAssigneeTasks(assigneeId, assigneeType)
    const resetTasks = await tasksService.resetAllSharedTasks(assigneeId)

    // Now delete any and all associated notifications triggered on behalf of company tasks for clients.
    // i.e. decrement client task count in CU portal
    if (assigneeType === AssigneeType.company) {
      const deletedTaskIds = [...tasks.map((task) => task.id), ...resetTasks.map((task) => task.id)] //to delete from clientNotifications
      await this.handleDeletingTaskNotifications(deletedTaskIds)
    }
  }

  private async handleDeletingTaskNotifications(taskIds: string[]) {
    const clientTaskNotifications = await this.db.clientNotification.findMany({
      where: {
        taskId: { in: taskIds },
      },
    })

    const clientNotificationIds = clientTaskNotifications.map((notification) => notification.notificationId)
    if (clientNotificationIds.length) {
      await this.copilot.bulkMarkNotificationsAsRead(clientNotificationIds)
      await this.db.clientNotification.deleteMany({ where: { notificationId: { in: clientNotificationIds } } })
    }
  }

  async handleClientUpdated(data: ClientUpdatedEventData) {
    const {
      id: clientId,
      companyIds: newCompanyIds,
      previousAttributes: { companyIds: prevCompanyIds },
    } = data
    // If companies haven't been changed then we don't have to migrate any tasks / notifications
    // When companies have been changed, the previousAttributes object will contain `companyIds` array with the previous company ids
    if (!prevCompanyIds || !newCompanyIds) return

    const removedCompanies = getArrayDifference(prevCompanyIds, newCompanyIds || [])
    const addedCompanies = getArrayDifference(newCompanyIds || [], prevCompanyIds)

    // Technically having multiple companies updated in one webhook event is not possible and accessing
    // removedCompanies[0] or addedCompanies[0] should be enough,
    // However I'm keeping this for future-proofing
    if (removedCompanies.length) {
      for (let companyId of removedCompanies) {
        await this.handleCompanyUnassignment(clientId, companyId)
      }
    }
    if (addedCompanies.length) {
      for (let companyId of addedCompanies) {
        await this.handleCompanyAssignment(clientId, companyId)
      }
    }
    return
  }

  private async handleCompanyAssignment(clientId: string, companyId: string) {
    // Notifications logic is the same as when a new client is created
    await this.handleClientCreated(clientId, companyId)
  }

  private async handleCompanyUnassignment(clientId: string, prevCompanyId: string) {
    const company = await this.copilot.getCompany(prevCompanyId)

    // NOTE: If prev company was not a valid company, instead a randomly generated placeholder company,
    // prevCompany.name will be an empty string
    if (!company.name) {
      // Fail safely since there can be multiple unassignments in one webhook event
      console.error(`WebhookService#handleCompanyUnassignment :: Cannot unassign from a company that does not exist`)
      return
    }

    // First find all tasks related to previous company
    const prevCompanyTasks = await this.db.task.findMany({
      where: {
        companyId: prevCompanyId,
        clientId: null,
        workflowState: {
          type: { not: StateType.completed },
        },
      },
    })

    // Find and reset tasks shared to previous company+client
    const prevSharedTasks = await this.db.task.findMany({
      where: {
        associations: {
          hasSome: [{ clientId, companyId: prevCompanyId }],
        },
        workspaceId: this.user.workspaceId,
      },
      select: { id: true },
    })

    await this.db.task.updateMany({
      where: {
        id: { in: prevSharedTasks.map((t) => t.id) },
      },
      data: {
        associations: [],
      },
    })

    const tasksNotificationsToDelete = [...prevCompanyTasks, ...prevSharedTasks]
    if (!tasksNotificationsToDelete.length) return

    const prevCompanyTaskIds = tasksNotificationsToDelete.map((task) => task.id)

    // Find all triggered notifications for this client, on behalf of prev company
    const prevCompanyNotifications = await this.db.clientNotification.findMany({
      where: {
        taskId: { in: prevCompanyTaskIds },
        clientId,
      },
    })
    const notificationIds = prevCompanyNotifications.map((notification) => notification.id)

    // Delete all task notifications triggered for client for previous company
    const deletePromises = []
    for (let { notificationId } of prevCompanyNotifications) {
      deletePromises.push(copilotBottleneck.schedule(() => this.copilot.markNotificationAsRead(notificationId)))
    }
    await Promise.all(deletePromises)
    await this.db.clientNotification.deleteMany({ where: { id: { in: notificationIds } } })
  }
}

export default WebhookService
