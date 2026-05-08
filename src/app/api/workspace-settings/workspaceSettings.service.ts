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
    return await this.db.workspaceSetting.upsert({
      where: { workspaceId },
      create: { workspaceId, ...data },
      update: data,
    })
  }
}
