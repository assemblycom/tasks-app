import { UpdateWorkspaceSettingsDTO } from '@/types/dto/workspaceSettings.dto'
import { BaseService } from '@api/core/services/base.service'
import { PoliciesService } from '@api/core/services/policies.service'
import { Resource } from '@api/core/types/api'
import { UserAction } from '@api/core/types/user'
import { Prisma, WorkspaceSetting } from '@prisma/client'

export class WorkspaceSettingsService extends BaseService {
  async getWorkspaceSettings() {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Read, Resource.WorkspaceSetting)

    const workspaceId = this.user.workspaceId
    const workspaceSetting = await this.db.workspaceSetting.findFirst({ where: { workspaceId, deletedAt: null } })

    return workspaceSetting ?? (await this.db.workspaceSetting.create({ data: { workspaceId } }))
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

  async overrideExistingClientViewSettings({
    previous,
    data,
  }: {
    previous: WorkspaceSetting | null
    data: UpdateWorkspaceSettingsDTO
  }) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Update, Resource.WorkspaceSetting)

    const cascade: Prisma.ViewSettingUpdateManyMutationInput = {}

    if (data.clientDefaultViewMode != null && data.clientDefaultViewMode !== previous?.clientDefaultViewMode) {
      cascade.viewMode = data.clientDefaultViewMode
    }
    // clientHideSubtasks is the inverse of the per-user showSubtasks flag.
    if (data.clientHideSubtasks != null && data.clientHideSubtasks !== previous?.clientHideSubtasks) {
      cascade.showSubtasks = !data.clientHideSubtasks
    }

    if (Object.keys(cascade).length === 0) {
      return
    }

    await this.db.viewSetting.updateMany({
      where: { workspaceId: this.user.workspaceId, clientId: { not: null } },
      data: cascade,
    })
  }
}
