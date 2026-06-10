import { ViewSettingUserIds, ViewSettingUserIdsType } from '@/types/common'
import { CreateViewSettingsDTO } from '@/types/dto/viewSettings.dto'
import { FilterOptions, IFilterOptions } from '@/types/interfaces'
import { emptyAssignee } from '@/utils/assignee'
import { BaseService } from '@api/core/services/base.service'
import { PoliciesService } from '@api/core/services/policies.service'
import { Resource } from '@api/core/types/api'
import { UserAction } from '@api/core/types/user'
import { ViewMode } from '@prisma/client'

export class ViewSettingsService extends BaseService {
  private DEFAULT_VIEW_MODE = ViewMode.board

  async getViewSettingsForUser() {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Read, Resource.ViewSetting)
    // strict null value if not defined
    const userIds = {
      internalUserId: this.user.internalUserId || null,
      clientId: this.user.clientId || null,
      companyId: this.user.companyId || null,
    }
    const parsedUserIds = ViewSettingUserIds.parse(userIds)
    let viewSettings = await this.db.viewSetting.findFirst({
      where: { ...parsedUserIds, workspaceId: this.user.workspaceId },
    })
    // If a viewSetting has not been set for this user, create a new one with default viewMode
    // This isn't required but will simplify frontend logic and ensure a view setting always exists for a given IU
    // We can modify default view settings much easier from the backend or using config vars in the future
    if (!viewSettings) {
      viewSettings = await this.createInitialViewSettings(parsedUserIds)
    }

    const filterOptions = viewSettings.filterOptions as IFilterOptions | null

    if (filterOptions && !filterOptions.creator) {
      viewSettings.filterOptions = { ...filterOptions, [FilterOptions.CREATOR]: emptyAssignee }
    }
    if (filterOptions && !filterOptions.association) {
      viewSettings.filterOptions = { ...filterOptions, [FilterOptions.ASSOCIATION]: emptyAssignee }
    }

    const enforced = await this.getEnforcedClientView()
    if (enforced.viewMode != null) {
      viewSettings.viewMode = enforced.viewMode
    }
    if (enforced.showSubtasks != null) {
      viewSettings.showSubtasks = enforced.showSubtasks
    }

    return {
      ...viewSettings,
      clientLocks: {
        viewMode: enforced.viewMode != null,
        showSubtasks: enforced.showSubtasks != null,
      },
    }
  }

  async createOrUpdateViewSettings(data: CreateViewSettingsDTO) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Create, Resource.ViewSetting)
    // strict null value if not defined
    const userIds = {
      internalUserId: this.user.internalUserId || null,
      clientId: this.user.clientId || null,
      companyId: this.user.companyId || null,
    }
    const parsedUserIds = ViewSettingUserIds.parse(userIds)
    const enforced = await this.getEnforcedClientView()
    const newViewSettingData = {
      ...data,
      ...(enforced.viewMode != null ? { viewMode: enforced.viewMode } : {}),
      ...(enforced.showSubtasks != null ? { showSubtasks: enforced.showSubtasks } : {}),
      ...parsedUserIds,
      workspaceId: this.user.workspaceId,
    }

    // Verify that a view setting exists, or if it doesn't then create a new initial view setting with provided data
    let viewSettings = await this.db.viewSetting.findFirst({
      where: { ...parsedUserIds, workspaceId: this.user.workspaceId },
    })
    if (!viewSettings) {
      return await this.createInitialViewSettings(parsedUserIds)
    }

    return await this.db.viewSetting.update({
      where: { id: viewSettings.id },
      data: newViewSettingData,
    })
  }

  // Locked client view settings configured at workspace level win over a client's own values.
  // Returns the enforced value per field, or null when the field is not locked (IUs are never locked).
  private async getEnforcedClientView(): Promise<{ viewMode: ViewMode | null; showSubtasks: boolean | null }> {
    if (this.user.internalUserId) {
      return { viewMode: null, showSubtasks: null }
    }
    const workspaceSetting = await this.db.workspaceSetting.findUnique({
      where: { workspaceId: this.user.workspaceId },
    })
    return {
      viewMode:
        workspaceSetting?.clientLockViewMode && workspaceSetting.clientDefaultViewMode
          ? workspaceSetting.clientDefaultViewMode
          : null,
      showSubtasks:
        workspaceSetting?.clientLockShowSubtasks && workspaceSetting.clientShowSubtasks != null
          ? workspaceSetting.clientShowSubtasks
          : null,
    }
  }

  private async createInitialViewSettings(userIds: ViewSettingUserIdsType) {
    const data = {
      ...userIds,
      workspaceId: this.user.workspaceId,
      viewMode: this.DEFAULT_VIEW_MODE,
      filterOptions: {
        [FilterOptions.ASSIGNEE]: emptyAssignee,
        [FilterOptions.ASSOCIATION]: emptyAssignee,
        [FilterOptions.CREATOR]: emptyAssignee,
        [FilterOptions.KEYWORD]: '',
        [FilterOptions.TYPE]: '',
      },
      showUnarchived: true,
      showArchived: false,
      showSubtasks: true, // If we DO need to default to false for IUs, we can add a condition here after confirmation
    }

    return await this.db.viewSetting.create({
      data,
    })
  }
}
