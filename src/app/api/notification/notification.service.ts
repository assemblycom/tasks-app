import {
  CompanyResponse,
  CopilotUser,
  NotificationCreatedResponse,
  NotificationCreatedResponseSchema,
  NotificationRequestBody,
  Uuid,
} from '@/types/common'
import { copilotBottleneck } from '@/utils/bottleneck'
import { isMessagableError } from '@/utils/copilotError'
import { CopilotAPI } from '@/utils/CopilotAPI'
import APIError from '@api/core/exceptions/api'
import { BaseService } from '@api/core/services/base.service'
import { NotificationTaskActions } from '@api/core/types/tasks'
import { getEmailDetails, getInProductNotificationDetails } from '@api/notification/notification.helpers'
import { AssigneeType, ClientNotification, Task } from '@prisma/client'
import Bottleneck from 'bottleneck'
import httpStatus from 'http-status'
import { z } from 'zod'
import { AssociationsSchema } from '@/types/dto/tasks.dto'
import { getTaskAssociations } from '@/utils/assignee'

export class NotificationService extends BaseService {
  async create(
    action: NotificationTaskActions,
    task: Task,
    opts: {
      disableEmail: boolean
      disableInProduct?: boolean
      commentId?: string
      senderCompanyId?: string
    } = { disableEmail: false },
  ) {
    try {
      // 1.Check for existing notification. Skip if duplicate
      const existingNotification = task.clientId
        ? await this.db.clientNotification.findFirst({
            where: { taskId: task.id, clientId: task.clientId, companyId: task.companyId },
          })
        : null
      if (task.clientId && existingNotification && !opts.commentId) {
        console.error(`NotificationService#create | Found existing notification for ${task.clientId}`, existingNotification)
        return
      }

      // 2. Dispatch notification to Copilot
      const workspace = await this.copilot.getWorkspace()
      const { senderId, senderCompanyId, recipientId, actionUser, companyName } = await this.getNotificationParties(
        task,
        action,
      )

      const inProduct = opts.disableInProduct
        ? undefined
        : getInProductNotificationDetails(workspace, actionUser, task, { companyName, commentId: opts?.commentId })[action]
      const email = opts.disableEmail
        ? undefined
        : getEmailDetails(workspace, actionUser, task, { commentId: opts?.commentId })[action]

      const notificationDetails = this.buildNotificationDetails(
        task,
        senderId,
        recipientId,
        { inProduct, email },
        senderCompanyId,
      )
      console.info('NotificationService#create | Creating single notification:', notificationDetails)

      let notification: NotificationCreatedResponse
      try {
        notification = await this.copilot.createNotification(notificationDetails)
      } catch (e: unknown) {
        notification = await this.handleIfSenderCompanyIdError(e, notificationDetails)
      }

      console.info('NotificationService#create | Created single notification:', notification)

      // 3. Save notification to ClientNotification or InternalUserNotification table. Check for notification.recipientClientId too
      if (task.assigneeType === AssigneeType.client && !!notification.recipientClientId && !opts.disableInProduct) {
        await this.addToClientNotifications(task, NotificationCreatedResponseSchema.parse(notification))
      }
      // NOTE: There are cases where task.assigneeType does not account for IU notification!
      // E.g. When receiving notifications from others completing task that IU created.
      // For now we don't have to store these so this hasn't been accounted for
      const shouldSendIUNotification =
        task.assigneeType === AssigneeType.internalUser &&
        (action === NotificationTaskActions.Assigned || action === NotificationTaskActions.ReassignedToIU)
      if (shouldSendIUNotification) {
        // Notification recipient is IU in this case
        await this.db.internalUserNotification.create({
          data: {
            internalUserId: recipientId,
            notificationId: notification.id,
            taskId: task.id,
          },
        })
      }

      return notification
    } catch (error) {
      console.error(`Failed to send notification for action: ${action}`, error)
    }
  }

  async createBulkNotification(
    action: NotificationTaskActions,
    task: Task,
    recipientIds: string[],
    opts?: { email?: boolean; disableInProduct?: boolean; commentId?: string; senderCompanyId?: string },
  ) {
    try {
      const [workspace, userInfo] = await Promise.all([this.copilot.getWorkspace(), this.copilot.me()])
      if (!userInfo) {
        throw new APIError(httpStatus.NOT_FOUND, `User not found for token ${this.user.token}`)
      }

      const senderId = z.string().parse(userInfo.id)
      const actionUserName = `${userInfo.givenName} ${userInfo.familyName}`

      const company =
        task?.assigneeId && task?.assigneeType === AssigneeType.company
          ? await this.copilot.getCompany(task?.assigneeId)
          : undefined
      const inProduct = opts?.disableInProduct
        ? undefined
        : getInProductNotificationDetails(workspace, actionUserName, task, {
            companyName: company?.name,
            commentId: opts?.commentId,
          })[action]
      const email = opts?.email
        ? getEmailDetails(workspace, actionUserName, task, { commentId: opts?.commentId })[action]
        : undefined

      // Get a list of all notifications dispatched for these taskId, clientId, companyId combinations
      // This will be used to filter out any duplicate notifications during creation
      const existingNotifications = await this.db.clientNotification.findMany({
        where: { taskId: task.id, clientId: { in: recipientIds }, companyId: task.companyId },
      })

      // `notifications` array contains the original order of all notifications dispatched
      // `clientNotifications` array contains notifications that are client notifications
      // `iuNotifications` array contains notifications that are internal user notifications
      // These two separate arrays are used to populate the appropriate DB tables "ClientNotifications" and "InternalUserNotifications"
      const notifications = []
      const clientNotifications = []
      const iuNotifications = []

      // NOTE: The reason we are skipping using NotificationService#create and implementing notification dispatch + save manually is because
      // we can just do one `createMany` DB call instead of one per notification, saving a ton of DB calls
      for (let recipientId of recipientIds) {
        try {
          // 1.Check for existing notification. Skip if duplicate
          const existingNotification = existingNotifications.find((notification) => notification.clientId === recipientId)
          if (existingNotification && !opts?.commentId) {
            console.error(
              `NotificationService#bulkCreate | Found existing notification for ${recipientId}`,
              existingNotification,
            )
            continue
          }

          // 2. Dispatch notification to Copilot
          const notificationDetails = this.buildNotificationDetails(
            task,
            senderId,
            recipientId,
            { inProduct, email },
            opts?.senderCompanyId,
          )

          console.info('NotificationService#bulkCreate | Creating single notification:', notificationDetails)
          let notification: NotificationCreatedResponse
          try {
            notification = await this.copilot.createNotification(notificationDetails)
          } catch (e: unknown) {
            notification = await this.handleIfSenderCompanyIdError(e, notificationDetails)
          }

          console.info('NotificationService#bulkCreate | Created single notification:', notification)
          if (!notification) {
            console.error(`NotificationService#bulkCreate | Failed to send notifications to ${recipientId}:`)
            continue
          }

          // 3. Maintain correct order of notifications in `notifications` array, else push to appropriate array
          notifications.push(notification)
          if (notification.recipientClientId) {
            clientNotifications.push(notification)
          } else if (notification.recipientInternalUserId) {
            iuNotifications.push(notification)
          } else {
            console.error(`NotificationService#bulkCreate | Failed to save notification to DB:`, notification)
          }
        } catch (err: unknown) {
          console.error(`NotificationService#bulkCreate | Failed to send notifications to ${recipientId}:`, err)
        }
      }

      // 4. Add client notifications and internalUserNotifications to DB
      console.info('NotificationService#bulkCreate | Adding client notifications to db')
      if (clientNotifications.length && !opts?.disableInProduct) {
        await this.db.clientNotification.createMany({
          data: clientNotifications.map((notification) => ({
            clientId: Uuid.parse(notification.recipientClientId),
            companyId: Uuid.parse(task.companyId),
            notificationId: notification.id,
            taskId: task.id,
          })),
        })
      }
      const shouldSendIUNotification =
        iuNotifications.length &&
        (action === NotificationTaskActions.Assigned || action === NotificationTaskActions.ReassignedToIU)
      if (shouldSendIUNotification) {
        await this.db.internalUserNotification.createMany({
          data: iuNotifications.map((notification) => ({
            internalUserId: Uuid.parse(notification.recipientInternalUserId),
            notificationId: notification.id,
            taskId: task.id,
          })),
        })
      }

      return notifications
    } catch (error) {
      console.error(`Failed to send notifications for action: ${action}`, error)
    }
  }

  /**
   * Adds a ClientNotification column associated with a task
   * @param task Associated task
   * @param notification Associated notification
   * @returns New ClientNotification object
   */
  async addToClientNotifications(task: Task, notification: NotificationCreatedResponse): Promise<ClientNotification> {
    return await this.db.clientNotification.create({
      data: {
        clientId: Uuid.parse(notification.recipientClientId),
        companyId: Uuid.parse(task.companyId),
        notificationId: notification.id,
        taskId: task.id,
      },
    })
  }

  deleteInternalUserNotificationsForTask = async (taskId: string) => {
    const notifications = await this.db.internalUserNotification.findMany({ where: { taskId } })
    const markAsReadPromises = []
    const bottleneck = new Bottleneck({ minTime: 250, maxConcurrent: 2 })
    for (let notification of notifications) {
      markAsReadPromises.push(
        // Mark IU notification as read
        bottleneck.schedule(() => {
          return this.copilot.deleteNotification(notification.notificationId)
        }),
      )
    }
    console.info(`Deleting all notifications triggerd by task ${taskId}`)
    await Promise.all(markAsReadPromises)
    // Hard delete this since we are not marking these as read, but deleting them
    await this.db.$executeRaw`
      DELETE FROM "InternalUserNotifications"
      WHERE "taskId" = ${taskId}::uuid
    `
  }

  deleteClientNotificationForTask = async (id: string) => {
    await this.db.$executeRaw`
      DELETE FROM "ClientNotifications"
      WHERE "taskId" = ${id}::uuid
    `
  }

  /**
   * Marks a client notification in Copilot Notifications service as read
   * @param id Notification ID for object as exists in Copilot
   */
  markClientNotificationAsRead = async (task: Task) => {
    try {
      const taskAssociations = getTaskAssociations(task)

      // Due to race conditions, we are forced to allow multiple client notifications for a single notification as well
      const relatedNotifications = await this.db.clientNotification.findMany({
        where: {
          // Accomodate company task lookups where clientId is null
          clientId: Uuid.nullable().parse(task.clientId) || taskAssociations?.clientId,
          companyId: Uuid.parse(task.companyId ?? taskAssociations?.companyId),
          taskId: task.id,
        },
      })
      if (!relatedNotifications.length) {
        console.error(
          `Failed to delete client notification for task id ${task.id} because the notification for client ${task.assigneeId} was not found`,
        )
        return
      }

      const notificationIds = relatedNotifications.map(({ notificationId }) => notificationId)
      await this.copilot.bulkMarkNotificationsAsRead(notificationIds)
      await this.db.clientNotification.deleteMany({ where: { notificationId: { in: notificationIds } } })
    } catch (e: unknown) {
      // There may be cases where existing notification has not been updated in the ClientNotifications table yet
      // So don't let it crash the entire program, instead just log it to stderr
      console.error(`Failed to delete client notification for task id ${task.id}`, e)
    }
  }

  markAsReadForAllRecipients = async (task: Task, action?: NotificationTaskActions) => {
    const { recipientIds } = await this.getNotificationParties(task, action ?? NotificationTaskActions.AssignedToCompany)

    for (let recipientId of recipientIds) {
      await this.markClientNotificationAsRead({
        ...task,
        assigneeId: recipientId,
        assigneeType: AssigneeType.client,
      })
    }

    // TODO: Optimized Mark as read while preventing burst ratelimits - will probably implement `bottleneck` package for this
    // const markAsReadPromises = recipientIds.map((recipientId) =>
    //   this.markClientNotificationAsRead({
    //     ...task,
    //     assigneeId: recipientId,
    //     assigneeType: AssigneeType.client,
    //   }),
    // )
  }

  async markAllAsReadForClients(copilot: CopilotAPI, tasks: Task[], clientIds: string[]) {
    const notifications = await this.db.clientNotification.findMany({
      where: {
        taskId: { in: tasks.map((task) => task.id) },
        clientId: { in: clientIds },
      },
    })

    // Get an array of notification ids for Copilot API
    const notificationPromises = []
    const bottleneck = new Bottleneck({ minTime: 250, maxConcurrent: 4 })
    for (let notification of notifications) {
      const promise = bottleneck.schedule(() => copilot.markNotificationAsRead(notification.notificationId))
      notificationPromises.push(promise)
    }
    await Promise.all(notificationPromises)
    await this.db.clientNotification.deleteMany({ where: { id: { in: notifications.map((obj) => obj.id) } } })
  }

  async bulkMarkAsRead(notificationIds: string[]): Promise<void> {
    const markAsReadPromises = []
    for (const id of notificationIds) {
      markAsReadPromises.push(copilotBottleneck.schedule(() => this.copilot.markNotificationAsRead(id)))
    }
    await Promise.all(markAsReadPromises)
  }

  /**
   * Get the concerned sender and receiver for a notification based on the action that triggered it. There are various actions
   * defined by NotificationTaskActions. This method returns the senderId, receiverId, and actionUser (user that is creating the notification action)
   * based on the NotificationTaskActions.
   */
  async getNotificationParties(task: Task, action: NotificationTaskActions) {
    let senderId: string = ''
    let senderCompanyId: string | undefined
    let recipientId: string = ''
    let recipientIds: string[] = []
    let actionTrigger: CopilotUser | CompanyResponse | null = null
    let companyName: string | undefined

    const getAssignedTo = async (): Promise<CopilotUser | CompanyResponse> => {
      switch (task.assigneeType) {
        case AssigneeType.internalUser:
          return await this.copilot.getInternalUser(senderId)
        case AssigneeType.client:
          return await this.copilot.getClient(z.string().uuid().parse(task.assigneeId))
        case AssigneeType.company:
          return await this.copilot.getCompany(z.string().parse(task.assigneeId))
        default:
          throw new APIError(httpStatus.NOT_FOUND, `Unknown assignee type: ${task.assigneeType}`)
      }
    }
    const associations = AssociationsSchema.parse(task.associations)

    switch (action) {
      case NotificationTaskActions.Shared:
        senderId = task.createdById
        recipientId = !!associations?.length ? z.string().parse(associations[0].clientId) : ''
        actionTrigger = await this.copilot.getInternalUser(senderId)
        break
      case NotificationTaskActions.SharedToCompany:
        senderId = task.createdById
        recipientIds = !!associations?.length
          ? (await this.copilot.getCompanyClients(z.string().parse(associations[0].companyId))).map((client) => client.id)
          : []
        actionTrigger = await this.copilot.getInternalUser(senderId)
        break
      case NotificationTaskActions.Assigned:
        senderId = task.createdById
        recipientId = z.string().parse(task.assigneeId)
        actionTrigger = await this.copilot.getInternalUser(senderId)
        break
      case NotificationTaskActions.AssignedToCompany:
        senderId = task.createdById
        recipientIds = (await this.copilot.getCompanyClients(z.string().parse(task.assigneeId))).map((client) => client.id)
        actionTrigger = await this.copilot.getInternalUser(senderId)
        break
      case NotificationTaskActions.CompletedByCompanyMember:
        senderId = z.string().parse(task.assigneeId)
        senderCompanyId = z.string().parse(task.companyId)
        const internalUsers = await this.copilot.getInternalUsers()
        const client =
          task.assigneeType === AssigneeType.client
            ? await this.copilot.getClient(z.string().uuid().parse(task.assigneeId))
            : undefined
        recipientIds = internalUsers.data
          .filter((iu) =>
            iu.isClientAccessLimited
              ? iu.companyAccessList?.includes(client?.companyId || z.string().parse(task.assigneeId))
              : true,
          )
          .map((iu) => iu.id)
        actionTrigger = await getAssignedTo()
        break
      case NotificationTaskActions.Completed:
        senderId = z.string().parse(task.assigneeId)
        senderCompanyId = z.string().parse(task.companyId)
        recipientId = task.createdById
        actionTrigger = await getAssignedTo()
        break
      case NotificationTaskActions.CompletedForCompanyByIU:
        const company = await this.copilot.getCompany(z.string().parse(task.assigneeId))
        companyName = company.name
      case NotificationTaskActions.CompletedByIU:
        senderId = z.string().parse(this.user.internalUserId)
        recipientId = task.createdById
        actionTrigger = await this.copilot.getInternalUser(senderId)
        break
      case NotificationTaskActions.CommentToCU:
        if (task.assigneeType === AssigneeType.client && task.assigneeId) {
          // the client is the assignee, they are part of the task
          recipientIds = [task.assigneeId]
        } else if (task.assigneeType === AssigneeType.company && task.assigneeId) {
          // this task is assigned to the company so all clients in company
          // should be considered as the recipients of the comment
          console.info('fetching clients for company:', task.assigneeId)
          const clientsInCompany = await this.copilot.getCompanyClients(task.assigneeId)
          const clientIds = clientsInCompany.map((client) => client.id)
          console.info('fetched client Ids', clientIds)
          recipientIds = clientIds
        }
        if (associations?.length) {
          const clientId = associations[0].clientId
          if (clientId) {
            recipientIds = [clientId] //spread recipientIds if we allow associations on client tasks.
          } else {
            const clientsInCompany = await this.copilot.getCompanyClients(associations[0].companyId)
            const clientIds = clientsInCompany.map((client) => client.id)
            console.info('fetched client Ids', clientIds)
            recipientIds = clientIds
          }
        } //associations comment notifications
        // this break is needed otherwise we will fallthrough to the IU case.
        // This is honestly unhinged JS behavior, I would not expect the
        // next case to run if the switch did not match it
        break
      case NotificationTaskActions.CommentToIU:
        // all internal users are potential parties in notifications for comments
        const getIUResponse = await this.copilot.getInternalUsers()
        senderCompanyId = this.user?.companyId

        if (task.assigneeType === AssigneeType.internalUser) {
          // when the assignee is an IU, we know that the all other IUs are involved
          // in notification
          recipientIds = getIUResponse.data.map((iu) => iu.id)
        } else {
          // when the assignee is not an IU, now we need to determine if IU has
          // access to the assignee of the task and filter the list of recipients
          let companyIdAssociatedWithTask = task.assigneeId
          if (task.assigneeType === AssigneeType.client) {
            // if the task is assigned to a company then we have the companyId to check for access
            if (task.assigneeId) {
              const taskClient = await this.copilot.getClient(task.assigneeId)
              companyIdAssociatedWithTask = taskClient.companyId
            }
          }
          recipientIds = getIUResponse.data
            .filter((iu) =>
              iu.isClientAccessLimited
                ? iu.companyAccessList?.includes(z.string().parse(companyIdAssociatedWithTask))
                : true,
            )
            .map((iu) => iu.id)
        }
      default:
        const userInfo = await this.copilot.me()
        senderId = z.string().parse(userInfo?.id)
        recipientId = z.string().parse(task.assigneeId)
        actionTrigger = userInfo as CopilotUser
        break
    }

    let actionUser = ''
    if (actionTrigger) {
      const excludeActions = [
        NotificationTaskActions.CompletedForCompanyByIU,
        NotificationTaskActions.CommentToCU,
        NotificationTaskActions.CommentToIU,
      ]
      actionUser =
        task.assigneeType === AssigneeType.company && !excludeActions.includes(action)
          ? (actionTrigger as CompanyResponse).name
          : `${(actionTrigger as CopilotUser).givenName} ${(actionTrigger as CopilotUser).familyName}`
    }

    return { senderId, senderCompanyId, recipientId, recipientIds, actionUser, companyName }
  }

  async getAllForTasks(tasks: Task[]): Promise<ClientNotification[]> {
    const taskIds = tasks.map((task) => task.id)
    return await this.db.clientNotification.findMany({
      where: { taskId: { in: taskIds }, clientId: this.user.clientId, companyId: this.user.companyId },
    })
  }

  private async handleIfSenderCompanyIdError(e: unknown, notificationDetails: NotificationRequestBody) {
    // Account for workspaces that don't have multi-companies enabled, thus don't support the senderCompanyId key
    // Yes, this is hacky. No, I don't have a choice (I can't find out if workspace has single/multi company at all from the Copilot API)
    if (isMessagableError(e) && e.body?.message === 'sender company ID is invalid based on sender') {
      console.info('NotificationService#create | senderCompanyId is not supported for this workspace (not multi-companies)')
      return await this.copilot.createNotification({
        ...notificationDetails,
        senderCompanyId: undefined,
      })
    } else if (e instanceof Error) {
      console.error('Error when handling sender companyId:')
      throw e
    } else {
      console.error(e)
      throw new Error('Failure while sending notification') // This is run in trigger so avoid using APIError
    }
  }

  private buildNotificationDetails(
    task: Task,
    senderId: string,
    recipientId: string,
    deliveryTargets: NotificationRequestBody['deliveryTargets'],
    senderCompanyId?: string,
  ): NotificationRequestBody {
    // Assume client notification then change details body if IU
    const associations = AssociationsSchema.parse(task.associations)
    const association = associations?.[0]
    const notificationDetails: NotificationRequestBody = {
      senderId,
      senderCompanyId,
      senderType: this.user.role,
      recipientClientId: recipientId ?? undefined,
      recipientCompanyId: task.companyId ?? association?.companyId ?? undefined,
      // If any of the given action is not present in details obj, that type of notification is not sent
      deliveryTargets: deliveryTargets || {},
    }
    //! Since IU's NEVER get email notifications, we send recipientCompanyId only if email is present
    const isIU = !notificationDetails.deliveryTargets?.email
    // In case this logic ever changes, good luck
    if (isIU) {
      delete notificationDetails.recipientCompanyId
      delete notificationDetails.recipientClientId
      notificationDetails.recipientInternalUserId = recipientId
    }
    return notificationDetails
  }
}
