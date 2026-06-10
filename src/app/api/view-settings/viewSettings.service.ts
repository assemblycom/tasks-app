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

    return viewSettings
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
    const newViewSettingData = {
      ...data,
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

  private async createInitialViewSettings(userIds: ViewSettingUserIdsType) {
    const clientDefaults = await this.getClientViewDefaults()
    const data = {
      ...userIds,
      workspaceId: this.user.workspaceId,
      viewMode: clientDefaults?.viewMode ?? this.DEFAULT_VIEW_MODE,
      filterOptions: {
        [FilterOptions.ASSIGNEE]: emptyAssignee,
        [FilterOptions.ASSOCIATION]: emptyAssignee,
        [FilterOptions.CREATOR]: emptyAssignee,
        [FilterOptions.KEYWORD]: '',
        [FilterOptions.TYPE]: '',
      },
      showUnarchived: true,
      showArchived: false,
      showSubtasks: clientDefaults?.showSubtasks ?? true,
    }

    return await this.db.viewSetting.create({
      data,
    })
  }

  // Workspace-level client defaults seed a new client's first view settings. IUs keep the hardcoded defaults.
  private async getClientViewDefaults(): Promise<{ viewMode: ViewMode | null; showSubtasks: boolean | null } | null> {
    if (this.user.internalUserId) {
      return null
    }
    const workspaceSetting = await this.db.workspaceSetting.findUnique({
      where: { workspaceId: this.user.workspaceId },
    })
    if (!workspaceSetting) {
      return null
    }
    return {
      viewMode: workspaceSetting.clientDefaultViewMode,
      showSubtasks: !workspaceSetting.clientHideSubtasks,
    }
  }
}
