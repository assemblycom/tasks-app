import APIError from '@/app/api/core/exceptions/api'
import { withRetry } from '@/app/api/core/utils/withRetry'
import { copilotAPIKey as apiKey, APP_ID, assemblyApiDomain } from '@/config'
import { MAX_LIMIT_CLIENT_COUNT } from '@/constants/users'
import {
  ClientRequest,
  ClientResponse,
  ClientResponseSchema,
  ClientsResponseSchema,
  ClientToken,
  ClientTokenSchema,
  CompaniesResponse,
  CompaniesResponseSchema,
  CompanyCreateRequest,
  CompanyResponse,
  CompanyResponseSchema,
  CopilotListArgs,
  CustomFieldResponse,
  CustomFieldResponseSchema,
  InternalUsers,
  InternalUsersResponse,
  InternalUsersResponseSchema,
  InternalUsersSchema,
  IUToken,
  IUTokenSchema,
  MeResponse,
  MeResponseSchema,
  NotificationCreatedResponse,
  NotificationCreatedResponseSchema,
  NotificationRequestBody,
  NotificationResponseSchema,
  NotificationResponseType,
  Token,
  TokenSchema,
  WorkspaceResponse,
  WorkspaceResponseSchema,
} from '@/types/common'
import { DISPATCHABLE_EVENT } from '@/types/webhook'
import Bottleneck from 'bottleneck'
import type { AssemblyAPI as SDK } from '@assembly-js/node-sdk'
import { assemblyApi } from '@assembly-js/node-sdk'
import { z } from 'zod'

export class CopilotAPI {
  private assemblyPromise: Promise<SDK>

  constructor(
    private token: string,
    customApiKey?: string,
  ) {
    this.assemblyPromise = assemblyApi({ apiKey: customApiKey ?? apiKey, token })
  }

  private async _manualFetch(route: string, query?: Record<string, string>, workspaceId?: string) {
    const url = new URL(`${assemblyApiDomain}/v1/${route}`)
    if (query) {
      for (const key of Object.keys(query)) {
        url.searchParams.set(key, query[key])
      }
    }
    const headers = {
      'X-API-KEY': workspaceId ? `${workspaceId}/${apiKey}` : apiKey,
      accept: 'application/json',
    }

    console.info('CopilotAPI#manualFetch |', url, headers)
    const resp = await fetch(url, { headers })
    const body = await resp.json()
    if (!resp.ok) {
      console.error('CopilotAPI#manualFetch | Response is not ok', resp, body)
      throw new APIError(resp.status, 'Failed to perform a Copilot API call: ' + JSON.stringify(body))
    }
    return body
  }

  // NOTE: Any method prefixed with _ is a API method that doesn't implement retry & delay
  // NOTE: Any normal API method name implements `withRetry` with default config

  // Get Token Payload from assembly request token
  async _getTokenPayload(): Promise<Token | null> {
    const assembly = await this.assemblyPromise
    const getTokenPayload = assembly.getTokenPayload
    if (!getTokenPayload) {
      console.error(`CopilotAPI#getTokenPayload | Could not parse token payload for token ${this.token}`)
      return null
    }

    return TokenSchema.parse(await getTokenPayload())
  }

  async _me(): Promise<MeResponse | null> {
    console.info('CopilotAPI#_me', this.token)
    const assembly = await this.assemblyPromise
    const tokenPayload = await this.getTokenPayload()
    const id = tokenPayload?.internalUserId || tokenPayload?.clientId
    if (!tokenPayload || !id) return null

    const retrieveCurrentUserInfo = tokenPayload.internalUserId ? assembly.retrieveInternalUser : assembly.retrieveClient
    const currentUserInfo = await retrieveCurrentUserInfo({ id })

    return MeResponseSchema.parse(currentUserInfo)
  }

  async _getWorkspace(): Promise<WorkspaceResponse> {
    console.info('CopilotAPI#_getWorkspace', this.token)
    const assembly = await this.assemblyPromise
    return WorkspaceResponseSchema.parse(await assembly.retrieveWorkspace())
  }

  async _getClientTokenPayload(): Promise<ClientToken | null> {
    console.info('CopilotAPI#_getClientTokenPayload', this.token)
    const tokenPayload = await this.getTokenPayload()
    if (!tokenPayload) return null

    return ClientTokenSchema.parse(tokenPayload)
  }

  async _getIUTokenPayload(): Promise<IUToken | null> {
    console.info('CopilotAPI#_getIUTokenPayload', this.token)
    const tokenPayload = await this.getTokenPayload()
    if (!tokenPayload) return null

    return IUTokenSchema.parse(tokenPayload)
  }

  async _createClient(requestBody: ClientRequest, sendInvite: boolean = false): Promise<ClientResponse> {
    console.info('CopilotAPI#_createClient', this.token)
    const assembly = await this.assemblyPromise
    return ClientResponseSchema.parse(await assembly.createClient({ sendInvite, requestBody }))
  }

  async _getClient(id: string): Promise<ClientResponse> {
    console.info('CopilotAPI#_getClient', this.token)
    const assembly = await this.assemblyPromise
    return ClientResponseSchema.parse(await assembly.retrieveClient({ id }))
  }

  async _getClients(args: CopilotListArgs & { companyId?: string } = {}) {
    console.info('CopilotAPI#_getClients', this.token)
    const assembly = await this.assemblyPromise
    const maxLimit = MAX_LIMIT_CLIENT_COUNT
    const requestedLimit = args.limit || maxLimit
    let clients: ClientResponse[] = []
    let nextToken: string | undefined = undefined

    if (requestedLimit <= maxLimit) {
      return ClientsResponseSchema.parse(await assembly.listClients(args))
    }

    //fetching client data in batches of MAX_LIMIT_CLIENT_COUNT instead of fetching it as a whole.
    do {
      const remaining = requestedLimit - clients.length
      const fetchLimit = Math.min(maxLimit, remaining)
      const response = await assembly.listClients({
        ...args,
        limit: fetchLimit,
        nextToken,
      })
      const parsedData = ClientsResponseSchema.parse(response)?.data ?? []
      clients.push(...parsedData)
      nextToken = response?.nextToken || undefined
    } while (nextToken && clients.length < requestedLimit)

    return ClientsResponseSchema.parse({ data: clients })
  }

  async _updateClient(id: string, requestBody: ClientRequest): Promise<ClientResponse> {
    console.info('CopilotAPI#_updateClient', this.token)
    const assembly = await this.assemblyPromise
    // @ts-ignore
    return ClientResponseSchema.parse(await assembly.updateClient({ id, requestBody }))
  }

  async _deleteClient(id: string) {
    console.info('CopilotAPI#_deleteClient', this.token)
    const assembly = await this.assemblyPromise
    return await assembly.deleteClient({ id })
  }

  async _createCompany(requestBody: CompanyCreateRequest) {
    console.info('CopilotAPI#_createCompany', this.token)
    const assembly = await this.assemblyPromise
    return CompanyResponseSchema.parse(await assembly.createCompany({ requestBody }))
  }

  async _getCompany(id: string): Promise<CompanyResponse> {
    console.info('CopilotAPI#_getCompany', this.token)
    const assembly = await this.assemblyPromise
    return CompanyResponseSchema.parse(await assembly.retrieveCompany({ id }))
  }

  async _getCompanies(args: CopilotListArgs & { isPlaceholder?: boolean } = {}): Promise<CompaniesResponse> {
    console.info('CopilotAPI#_getCompanies', this.token)
    const assembly = await this.assemblyPromise
    return CompaniesResponseSchema.parse(await assembly.listCompanies(args))
  }

  async _getCompanyClients(companyId: string): Promise<ClientResponse[]> {
    console.info('CopilotAPI#_getCompanyClients', this.token)
    return (await this.getClients({ limit: 10000, companyId })).data || []
  }

  async _getCustomFields(): Promise<CustomFieldResponse> {
    console.info('CopilotAPI#_getCustomFields', this.token)
    const assembly = await this.assemblyPromise
    return CustomFieldResponseSchema.parse(await assembly.listCustomFields({}))
  }

  async _getInternalUsers(args: CopilotListArgs = {}): Promise<InternalUsersResponse> {
    console.info('CopilotAPI#_getInternalUsers', this.token)
    const assembly = await this.assemblyPromise
    return InternalUsersResponseSchema.parse(await assembly.listInternalUsers(args))
  }

  async _getInternalUser(id: string): Promise<InternalUsers> {
    console.info('CopilotAPI#_getInternalUser', this.token)
    const assembly = await this.assemblyPromise
    return InternalUsersSchema.parse(await assembly.retrieveInternalUser({ id }))
  }

  async _createNotification(requestBody: NotificationRequestBody): Promise<NotificationCreatedResponse> {
    console.info('CopilotAPI#_createNotification', this.token)
    const assembly = await this.assemblyPromise
    const notification = await assembly.createNotification({ requestBody })
    return NotificationCreatedResponseSchema.parse(notification)
  }

  async _markNotificationAsRead(id: string): Promise<void> {
    console.info('CopilotAPI#_markNotificationAsRead', this.token)
    const assembly = await this.assemblyPromise
    await assembly.markNotificationRead({ id })
  }

  async _bulkMarkNotificationsAsRead(notificationIds: string[], shouldThrowError: boolean = true): Promise<void> {
    console.info('CopilotAPI#_bulkMarkNotificationsAsRead', this.token)
    const markAsReadPromises = []
    const bottleneck = new Bottleneck({ minTime: 250, maxConcurrent: 2 })

    for (let notification of notificationIds) {
      markAsReadPromises.push(
        bottleneck
          .schedule(() => {
            console.info('CopilotAPI#_bulkMarkNotificationsAsRead | Marking notification as read', this.token, notification)
            if (shouldThrowError) {
              return this.markNotificationAsRead(notification)
            } else {
              try {
                return this.markNotificationAsRead(notification)
              } catch (error) {
                console.warn('Mark as read notification failed for notification')
                return new Promise(() => null)
              }
            }
          })
          .catch((err: unknown) => console.error(`Failed to delete notification with id ${notification}`, err)),
      )
    }

    await Promise.all(markAsReadPromises)
  }

  async _deleteNotification(id: string): Promise<void> {
    console.info('CopilotAPI#_deleteNotification', this.token)
    const assembly = await this.assemblyPromise
    await assembly.deleteNotification({ id })
  }

  async _bulkDeleteNotifications(notificationIds: string[]): Promise<void> {
    console.info('CopilotAPI#_bulkDeleteNotifications', this.token)
    const deletePromises = []
    const bottleneck = new Bottleneck({ minTime: 250, maxConcurrent: 2 })
    for (let notification of notificationIds) {
      deletePromises.push(
        bottleneck
          .schedule(() => {
            return this.deleteNotification(notification)
          })
          .catch((err: unknown) => console.error(`Failed to delete notification with id ${notification}`, err)),
      )
    }
    await Promise.all(deletePromises)
  }

  async _getIUNotification(id: string, workspaceId: string): Promise<NotificationResponseType> {
    console.info('CopilotAPI#_deleteNotification', this.token)
    const response = await this.manualFetch(
      `notifications/${id}`,
      {
        includeRead: 'true',
      },
      workspaceId,
    )
    return NotificationResponseSchema.parse(response)
  }

  async _getClientNotifications(
    recipientClientId: string,
    recipientCompanyId: string,
    workspaceId: string,
    opts: {
      limit?: number
      showArchived?: boolean
      showUnarchived?: boolean
      showIncompleteOnly?: boolean
    } = { limit: 100 },
  ) {
    console.info('CopilotAPI#_getClientNotifications', this.token)
    const response = await this.manualFetch(
      'notifications',
      {
        recipientClientId,
        recipientCompanyId,
        limit: `${opts.limit}`,
      },
      workspaceId,
    )
    const notifications = z.array(NotificationCreatedResponseSchema).parse(response.data)
    // Return only all notifications triggered by tasks-app
    return notifications
      .filter((notification) => notification.appId === z.string({ message: 'Missing AppID in environment' }).parse(APP_ID))
      .filter((notification) => {
        const isSameRecipientCompanyId =
          notification.recipientCompanyId && notification.recipientCompanyId === recipientCompanyId
        const isSameCompanyId = notification.companyId && notification.companyId === recipientCompanyId
        return isSameRecipientCompanyId || isSameCompanyId
      })
  }

  async dispatchWebhook(eventName: DISPATCHABLE_EVENT, { workspaceId, payload }: { workspaceId: string; payload?: object }) {
    console.info('CopilotAPI#dispatchWebhook', this.token)
    const url = `${assemblyApiDomain}/v1/webhooks/${eventName}`
    console.info('CopilotAPI#dispatchWebhook | Dispatching webhook to ', url, 'with payload', payload ?? null)

    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': `${workspaceId}/${apiKey}`,
        },
        body: payload ? JSON.stringify(payload) : null,
      })
    } catch (e) {
      console.error(`Failed to dispatch webhook for event ${eventName}`, e)
    }
  }

  private wrapWithRetry<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>): (...args: Args) => Promise<R> {
    return (...args: Args): Promise<R> => withRetry(fn.bind(this), args)
  }

  // Methods wrapped with retry
  getTokenPayload = this.wrapWithRetry(this._getTokenPayload)
  me = this.wrapWithRetry(this._me)
  getWorkspace = this.wrapWithRetry(this._getWorkspace)
  getClientTokenPayload = this.wrapWithRetry(this._getClientTokenPayload)
  getIUTokenPayload = this.wrapWithRetry(this._getIUTokenPayload)
  createClient = this.wrapWithRetry(this._createClient)
  getClient = this.wrapWithRetry(this._getClient)
  getClients = this.wrapWithRetry(this._getClients)
  updateClient = this.wrapWithRetry(this._updateClient)
  deleteClient = this.wrapWithRetry(this._deleteClient)
  createCompany = this.wrapWithRetry(this._createCompany)
  getCompany = this.wrapWithRetry(this._getCompany)
  getCompanies = this.wrapWithRetry(this._getCompanies)
  getCompanyClients = this.wrapWithRetry(this._getCompanyClients)
  getCustomFields = this.wrapWithRetry(this._getCustomFields)
  getInternalUsers = this.wrapWithRetry(this._getInternalUsers)
  getInternalUser = this.wrapWithRetry(this._getInternalUser)
  createNotification = this.wrapWithRetry(this._createNotification)
  getClientNotifications = this.wrapWithRetry(this._getClientNotifications)
  markNotificationAsRead = this.wrapWithRetry(this._markNotificationAsRead)
  bulkMarkNotificationsAsRead = this.wrapWithRetry(this._bulkMarkNotificationsAsRead)
  deleteNotification = this.wrapWithRetry(this._deleteNotification)
  bulkDeleteNotifications = this.wrapWithRetry(this._bulkDeleteNotifications)
  manualFetch = this.wrapWithRetry(this._manualFetch)
  getIUNotification = this.wrapWithRetry(this._getIUNotification)
}
