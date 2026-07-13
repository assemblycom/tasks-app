import { ViewSettingUserIds, ViewSettingUserIdsType } from '@/types/common'
import { CreateViewSettingsDTO } from '@/types/dto/viewSettings.dto'
import { FilterOptions, IFilterOptions } from '@/types/interfaces'
import { emptyAssignee } from '@/utils/assignee'
import { BaseService } from '@api/core/services/base.service'
import { PoliciesService } from '@api/core/services/policies.service'
import { Resource } from '@api/core/types/api'
import { UserAction, UserRole } from '@api/core/types/user'
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
    const { viewMode, showSubtasks } = await this.resolveInitialDisplayDefaults()
    const data = {
      ...userIds,
      workspaceId: this.user.workspaceId,
      viewMode,
      filterOptions: {
        [FilterOptions.ASSIGNEE]: emptyAssignee,
        [FilterOptions.ASSOCIATION]: emptyAssignee,
        [FilterOptions.CREATOR]: emptyAssignee,
        [FilterOptions.KEYWORD]: '',
        [FilterOptions.TYPE]: '',
      },
      showUnarchived: true,
      showArchived: false,
      showSubtasks,
    }

    return await this.db.viewSetting.create({
      data,
    })
  }

  // Workspace-level client view settings seed a CU's first view setting row.
  // IUs are unaffected and keep the hardcoded defaults. Unset (null) overrides
  // fall back to those same defaults, so existing behavior is preserved.
  private async resolveInitialDisplayDefaults(): Promise<{ viewMode: ViewMode; showSubtasks: boolean }> {
    const fallback = { viewMode: this.DEFAULT_VIEW_MODE, showSubtasks: true }
    if (this.user.role !== UserRole.Client) {
      return fallback
    }

    const workspaceSetting = await this.db.workspaceSetting.findUnique({
      where: { workspaceId: this.user.workspaceId },
      select: { clientDefaultViewMode: true, clientHideSubtasks: true },
    })

    return {
      viewMode: workspaceSetting?.clientDefaultViewMode ?? fallback.viewMode,
      // clientHideSubtasks is the inverse of showSubtasks.
      showSubtasks:
        workspaceSetting?.clientHideSubtasks != null ? !workspaceSetting.clientHideSubtasks : fallback.showSubtasks,
    }
  }
}
