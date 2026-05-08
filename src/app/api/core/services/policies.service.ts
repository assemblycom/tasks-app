import { UserAction, UserRole } from '@api/core/types/user'
import { Resource } from '@api/core/types/api'
import { BaseService } from './base.service'
import APIError from '@api/core/exceptions/api'
import httpStatus from 'http-status'

/**
 * Resource-level policies control service for Users (IU + Client)
 */
export class PoliciesService extends BaseService {
  private defaultPolicies: Record<UserRole.Client, Record<Resource, UserAction[]>> = {
    [UserRole.Client]: {
      [Resource.Tasks]: [UserAction.Read],
      [Resource.TaskTemplates]: [],
      [Resource.WorkflowState]: [UserAction.Read],
      [Resource.ViewSetting]: [UserAction.Read, UserAction.Create],
      [Resource.WorkspaceSetting]: [],
      [Resource.Users]: [],
      [Resource.Attachments]: [UserAction.Read, UserAction.Create, UserAction.Delete],
      [Resource.Comment]: [UserAction.Read, UserAction.Create, UserAction.Update],
      [Resource.ScrapMedias]: [],
      [Resource.Notifications]: [UserAction.Update],
    },
  }

  authorize(action: UserAction, resource: Resource): boolean | void {
    // In the future if we want configurable permissions, we can set them here

    // If user role is IU, grant them unrestricted access to all resources
    if (this.user.role === UserRole.IU) {
      return true
    }

    // Grab user role policies from `defaultPolicies`
    const userPolicy = this.defaultPolicies[this.user.role][resource]
    const isAuthorized = userPolicy.includes(UserAction.All) || userPolicy.includes(action)
    if (!isAuthorized) {
      throw new APIError(httpStatus.UNAUTHORIZED, 'You are not authorized to perform this action')
    }
  }
}
