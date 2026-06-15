import { UpdateWorkspaceSettingsDTO } from '@/types/dto/workspaceSettings.dto'
import { BaseService } from '@api/core/services/base.service'
import { PoliciesService } from '@api/core/services/policies.service'
import { Resource } from '@api/core/types/api'
import { UserAction } from '@api/core/types/user'
import { Prisma, PrismaClient, WorkspaceSetting } from '@prisma/client'

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

    return this.db.$transaction(async (tx) => {
      this.setTransaction(tx as PrismaClient)

      const previous = await this.db.workspaceSetting.findUnique({ where: { workspaceId } })

      // The settings row is created lazily on read (getWorkspaceSettings), so by the
      // time a setting is changed it always exists — update only, never insert.
      const updated = await this.db.workspaceSetting.update({
        where: { workspaceId },
        data,
      })

      await this.overrideExistingClientViewSettings({ previous, data })

      this.unsetTransaction()
      return updated
    })
  }

  private async overrideExistingClientViewSettings({
    previous,
    data,
  }: {
    previous: WorkspaceSetting | null
    data: UpdateWorkspaceSettingsDTO
  }) {
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
