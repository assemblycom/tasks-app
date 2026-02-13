import { type CommentInitiator, StateType } from '@prisma/client'
import { z } from 'zod'
import { UserRole } from '@/app/api/core/types/user'
import { validateNotificationRecipient } from '@/utils/notifications'
import type { UserIds } from './interfaces'

export const Uuid = z.string().uuid()

export const HexColorSchema = z.string().refine((val) => /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(val), {
  message: 'Invalid hex color code',
})

export type CopilotListArgs = {
  limit?: number
  nextToken?: string
}

export const TokenSchema = z.object({
  clientId: z.string().optional(),
  companyId: z
    .string()
    .transform((val) => (val === 'default' ? undefined : val))
    .optional(),
  internalUserId: z.string().optional(),
  workspaceId: z.string(),
  notificationId: z.string().optional(),
})
export type Token = z.infer<typeof TokenSchema>

export const IUTokenSchema = z.object({
  internalUserId: z.string(),
  workspaceId: z.string(),
})
export type IUToken = z.infer<typeof IUTokenSchema>

export const ClientTokenSchema = z.object({
  clientId: z.string(),
  companyId: z.string().optional(),
  workspaceId: z.string(),
})
export type ClientToken = z.infer<typeof ClientTokenSchema>

export const MeResponseSchema = z.object({
  id: z.string(),
  givenName: z.string(),
  familyName: z.string(),
  email: z.string(),
  portalName: z.string().optional(),
})
export type MeResponse = z.infer<typeof MeResponseSchema>

// Response schema for `/workspace` endpoint
export const WorkspaceResponseSchema = z.object({
  id: z.string(),
  isCompaniesEnabled: z.boolean().optional(),
  industry: z.string().optional(),
  isClientDirectSignUpEnabled: z.boolean().optional(),
  logOutUrl: z.string().optional(),
  brandName: z.string().optional(),
  squareIconUrl: z.string().optional(),
  fullLogoUrl: z.string().optional(),
  squareLoginImageUrl: z.string().optional(),
  socialSharingImageUrl: z.string().optional(),
  colorSidebarBackground: z.string().optional(),
  colorSidebarText: z.string().optional(),
  colorAccent: z.string().optional(),
  font: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  portalUrl: z.string().optional(),
  labels: z
    .object({
      individualTerm: z.string().optional(),
      individualTermPlural: z.string().optional(),
      groupTerm: z.string().optional(),
      groupTermPlural: z.string().optional(),
    })
    .optional(),
})
export type WorkspaceResponse = z.infer<typeof WorkspaceResponseSchema>

export const ClientResponseSchema = z.object({
  id: z.string(),
  givenName: z.string(),
  familyName: z.string(),
  email: z.string(),
  companyId: z.string(),
  companyIds: z.array(z.string().uuid()).optional(),
  status: z.string(),
  avatarImageUrl: z.string().nullable(),
  customFields: z
    .record(z.string(), z.union([z.string().nullable(), z.array(z.string()).nullable(), z.object({}).nullable()]))
    .nullable(),
  fallbackColor: z.string().nullish(),
  createdAt: z.string().datetime(),
})
export type ClientResponse = z.infer<typeof ClientResponseSchema>

export const ClientsResponseSchema = z.object({
  data: z.array(ClientResponseSchema).nullable(),
})
export type ClientsResponse = z.infer<typeof ClientsResponseSchema>

export const CompanyResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  iconImageUrl: z.string().nullable(),
  fallbackColor: z.string().nullish(),
  isPlaceholder: z.boolean().optional(),
  createdAt: z.string().datetime(),
})
export type CompanyResponse = z.infer<typeof CompanyResponseSchema>

export const CompaniesResponseSchema = z.object({
  data: z.array(CompanyResponseSchema).nullable(),
})
export type CompaniesResponse = z.infer<typeof CompaniesResponseSchema>

export const CompanyCreateRequestSchema = z.object({
  name: z.string(),
  iconImageUrl: z.string().optional(),
  fallbackColor: HexColorSchema.optional(),
})
export type CompanyCreateRequest = z.infer<typeof CompanyCreateRequestSchema>

export const CustomFieldSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  type: z.string(),
  order: z.number(),
  object: z.string(),
  options: z
    .array(
      z.object({
        id: z.string(),
        key: z.string(),
        label: z.string(),
        color: z.string(),
      }),
    )
    .optional(),
})
export type CustomField = z.infer<typeof CustomFieldSchema>
export const CustomFieldResponseSchema = z.object({
  data: z.array(CustomFieldSchema).nullable(),
})
export type CustomFieldResponse = z.infer<typeof CustomFieldResponseSchema>

export const ClientRequestSchema = z.object({
  givenName: z.string(),
  familyName: z.string(),
  email: z.string().email(),
  companyId: z.string().uuid().optional(),
  // NOTE: customFields can also be passed as a JSON object, but CopilotAPI has its type defined to stringified JSON
  customFields: z.string().optional(),
})
export type ClientRequest = z.infer<typeof ClientRequestSchema>

export const InternalUsersSchema = z.object({
  id: z.string().uuid(),
  givenName: z.string(),
  familyName: z.string(),
  email: z.union([z.string().email(), z.literal('')]), // Deleted IUs can be queried, but have no email
  avatarImageUrl: z.string().optional(),
  isClientAccessLimited: z.boolean().default(false),
  companyAccessList: z.array(z.string()).nullable(),
  fallbackColor: z.string().nullish(),
  createdAt: z.string().datetime(),
})
export type InternalUsers = z.infer<typeof InternalUsersSchema>

export const InternalUsersResponseSchema = z.object({
  data: z.array(InternalUsersSchema),
})
export type InternalUsersResponse = z.infer<typeof InternalUsersResponseSchema>

/**
 * `senderType` field for notification payload in Copilot API
 */
export const NotificationSenderSchema = z.enum(['internalUser', 'client'])
export type NotificationSender = z.infer<typeof NotificationSenderSchema>

/**
 * Notification RequestBody schema - accepted by SDK#createNotification
 */
export const NotificationRequestBodySchema = z
  .object({
    senderId: z.string(),
    // New notification body schema for copilot to accomodate for multiple companies
    senderType: NotificationSenderSchema,
    senderCompanyId: z.string().optional(),
    recipientInternalUserId: z.string().optional(),
    recipientClientId: z.string().optional(),
    recipientCompanyId: z.string().optional(),
    deliveryTargets: z
      .object({
        inProduct: z
          .object({
            title: z.string(),
            body: z.string().optional(),
          })
          .optional(),
        email: z
          .object({
            subject: z.string().optional(),
            header: z.string().optional(),
            title: z.string().optional(),
            body: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .superRefine(validateNotificationRecipient)

export const ScrapMediaRequestSchema = z.object({
  filePath: z.string(),
  taskId: z.string().uuid().nullable(),
  templateId: z.string().uuid().nullable(),
})

export type ScrapMediaRequest = z.infer<typeof ScrapMediaRequestSchema>
export type CopilotUser = InternalUsers | ClientResponse

export type NotificationRequestBody = z.infer<typeof NotificationRequestBodySchema>

export const NotificationCreatedResponseSchema = z.object({
  id: z.string(),
  appId: z.string().uuid().optional(),
  createdAt: z.string().datetime(),
  event: z.string().optional(),
  object: z.string().optional(),
  companyId: z.string().optional(),
  recipientInternalUserId: z.string().optional(),
  recipientClientId: z.string().optional(),
  recipientCompanyId: z.string().optional(),
  resourceId: z.string().optional(),
  senderId: z.string().optional(),
  senderType: z.string().optional(),
})
export type NotificationCreatedResponse = z.infer<typeof NotificationCreatedResponseSchema>

export const UserSchema = z.object({
  token: z.string(),
  role: z.nativeEnum(UserRole),
  workspaceId: z.string(),
  clientId: z.string().optional(),
  companyId: z.string().optional(),
  internalUserId: z.string().optional(),
})

export interface FilterableUser {
  id: string
  givenName?: string
  familyName?: string
  name?: string
}

export type PreviewMode = 'client' | 'company' | null

export interface InitiatedEntity {
  initiatorId: string
  initiatorType: CommentInitiator | null
}

const rfc3339Regex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))$/

export const RFC3339DateSchema = z.string().refine((val) => rfc3339Regex.test(val), {
  message: 'Invalid RFC3339 datetime string',
})
export type RFC3339Date = z.infer<typeof RFC3339DateSchema>

export const StateTypeSchema = z.nativeEnum(StateType)

export type PreviewClientCompanyType = {
  [K in Exclude<UserIds, UserIds.INTERNAL_USER_ID>]: string | null
}

export type UrlActionParamsType = {
  action?: string
  pf?: string
  oldPf?: string
}

export const NotificationInProductCtaParamsSchema = z.object({
  taskId: z.string(),
  commentId: z.string().optional(),
})

export const NotificationResponseSchema = z.object({
  deliveryTargets: z
    .object({
      inProduct: z
        .object({
          title: z.string().optional(),
          isRead: z.boolean().optional(),
          ctaParams: NotificationInProductCtaParamsSchema.optional(),
        })
        .optional(),
    })
    .optional(),
  id: z.string(),
})
export type NotificationResponseType = z.infer<typeof NotificationResponseSchema>

export const ViewSettingUserIds = z
  .object({
    internalUserId: z.string().nullable(),
    clientId: z.string().nullable(),
    companyId: z.string().nullable(),
  })
  .superRefine((val) => {
    if (!val.clientId && !val.companyId && !val.internalUserId) {
      throw new Error('At least one of clientId, companyId, or internalUserId must be provided')
    }
    if (val.clientId && !val.companyId) {
      throw new Error('companyId must be provided when clientId is provided')
    }
  })
export type ViewSettingUserIdsType = z.infer<typeof ViewSettingUserIds>

/**
 * FilterType enum for FilterBtn with value being the full form of that particular type
 */
export enum FilterType {
  Assignee = 'Assignee',
  Association = 'Related to',
  IsShared = 'Shared with',
  Creator = 'Creator',
}

export enum SelectorFieldType {
  ASSIGNEE = 'assignee',
  ASSOCIATION = 'association',
}

export const TempClientFilterSchema = z.object({
  associations: z.object({
    hasSome: z.array(z.object({ clientId: z.string().uuid().optional(), companyId: z.string().uuid() })),
  }),
  isShared: z.boolean().optional(),
})
export type TempClientFilter = z.infer<typeof TempClientFilterSchema>
