import { UserSchema } from '@/types/common'
import { UpdateTaskRequestSchema } from '@/types/dto/tasks.dto'
import { ObjectType } from '@/utils/addTypeToAssignee'
import { UserIdsType } from '@/utils/assignee'
import { z } from 'zod'

export enum TargetMethod {
  EDIT = 'edit',
  POST = 'post',
}

export enum UserType {
  INTERNAL_USER = 'iu',
  CLIENT_USER = 'cu',
}

export enum View {
  LIST_VIEW = 'list',
  BOARD_VIEW = 'board',
}

export enum CreateTaskErrors {
  TITLE = 'title',
}

export enum createTemplateErrors {
  TITLE = 'title',
}

export enum Sizes {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
}

export enum FileTypes {
  PNG = 'image/png',
  PDF = 'application/pdf',
  SVG = 'image/svg+xml',
  CSV = 'text/csv',
  ZIP = 'application/zip',
  MSWORD = 'application/msword',
  AVI = 'video/vnd.avi',
  JPEG = 'image/jpeg',
  QUICKTIME = 'video/quicktime',
  MP4 = 'video/mp4',
  EXCEL = 'application/vnd.ms-excel',
  ISO = 'application/vnd.efi.iso',
  PLAIN = 'text/plain',
  GIF = 'image/gif',
  MPEG = 'audio/mpeg',
}

export enum FilterOptions {
  ASSIGNEE = 'assignee',
  ASSOCIATION = 'association',
  IS_SHARED = 'isShared',
  CREATOR = 'creator',
  KEYWORD = 'keyword',
  TYPE = 'type',
}

export enum FilterByOptions {
  CLIENT = 'clients',
  COMPANY = 'companies',
  IUS = 'internalUsers',
  NOFILTER = 'none',
}

export enum FilterOptionsKeywords {
  CLIENTS = 'clients_companies',
  TEAM = 'ius',
  UNASSIGNED = 'unassigned',
  CLIENT_WITH_VIEWERS = 'client_with_viewers',
}

export enum HandleSelectorComponentModes {
  CreateTaskFieldUpdate,
  //add more modes here if we are to extend useHandleSelectorComponent with more features.
}

export enum UserIds {
  INTERNAL_USER_ID = 'internalUserId',
  CLIENT_ID = 'clientId',
  COMPANY_ID = 'companyId',
}

export enum AttachmentTypes {
  TASK = 'tasks',
  TEMPLATE = 'templates',
  COMMENT = 'comments',
}

export type IFilterOptions = {
  [key in FilterOptions]: key extends FilterOptions.ASSIGNEE
    ? UserIdsType
    : key extends FilterOptions.ASSOCIATION
      ? UserIdsType
      : key extends FilterOptions.CREATOR
        ? UserIdsType
        : key extends FilterOptions.IS_SHARED
          ? UserIdsType
          : string
}

export interface IAssignee {
  ius: Omit<IIus, 'type'>[]
  internalUsers: Omit<IIus, 'type'>[]
  clients: Omit<IClient, 'type'>[]
  companies: Omit<ICompany, 'type'>[]
}

export interface ISelectorOption {
  value: string
  label: string
  avatarSrc?: string
  avatarFallbackColor?: string
  companyId?: string
  type: ObjectType
}

export interface ISelectorAssignee {
  clients: ISelectorOption[]
  internalUsers: Omit<ISelectorOption, 'companyId'>[]
  companies: Omit<ISelectorOption, 'companyId'>[]
}

export interface InputValue {
  id: string
  companyId?: string
  object: ObjectType
}

export interface IIus {
  id: string
  givenName: string
  familyName: string
  email: string
  type: AssigneeType
}

export interface IClient {
  id: string
  givenName: string
  familyName: string
  email: string
  companyId: string
  status: string
  avatarImageUrl: string
  customFields: unknown
  type: AssigneeType
  companyIds: string[]
}

export interface ICompany {
  id: string
  name: string
  iconImageUrl: string
  fallbackColor: string
  type: AssigneeType
}

export type AssigneeType = keyof IAssignee

export interface IAssigneeCombined {
  id: string
  givenName?: string
  familyName?: string
  email?: string
  type: AssigneeType
  companyId?: string
  companyIds?: string[]
  status?: string
  avatarImageUrl?: string
  customFields?: unknown
  name?: string
  iconImageUrl?: string
  fallbackColor?: string
}

export interface IAssigneeSuggestions {
  id: string
  label: string
}

export interface ITemplate {
  id: string
  workspaceId: string
  title: string
  body: string
  workflowStateId: string
  createdBy: string
  createdAt: string
  updatedAt: string
  parentId: string | null
  subTaskTemplates: ITemplate[]
  parent?: ITemplate | null
}

export interface ISignedUrlUpload {
  signedUrl: string
  token: string
  path: string
}

export interface IExtraOption {
  id: string
  name: string
  value?: string
  extraOptionFlag: true
  avatarImageUrl?: string
}

export const DataSchema = z.object({
  user: UserSchema,
  task: UpdateTaskRequestSchema,
})

export const UserTypesName = {
  ius: 'Internal users',
  internalUsers: 'Internal users',
  clients: 'Clients',
  companies: 'Companies',
  standalone: 'Standalone', // for options in selector component which shall not be grouped
}

export interface PropsWithToken {
  token: string
}
