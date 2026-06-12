import { UpdateWorkspaceSettingsDTO } from '@/types/dto/workspaceSettings.dto'
import { BaseService } from '@api/core/services/base.service'
import { PoliciesService } from '@api/core/services/policies.service'
import { Resource } from '@api/core/types/api'
import { UserAction } from '@api/core/types/user'

export class WorkspaceSettingsService extends BaseService {
  async getWorkspaceSettings() {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Read, Resource.WorkspaceSetting)

    const workspaceId = this.user.workspaceId
    let workspaceSetting = await this.db.workspaceSetting.findUnique({ where: { workspaceId } })
    if (!workspaceSetting) {
      workspaceSetting = await this.db.workspaceSetting.create({ data: { workspaceId } })
    }

    return workspaceSetting
  }

  async updateWorkspaceSettings(data: UpdateWorkspaceSettingsDTO) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Update, Resource.WorkspaceSetting)

    const workspaceId = this.user.workspaceId
    // The settings row is created lazily on read (getWorkspaceSettings), so by the
    // time a setting is changed it always exists — update only, never insert.
    return await this.db.workspaceSetting.update({
      where: { workspaceId },
      data,
    })
  }
}
