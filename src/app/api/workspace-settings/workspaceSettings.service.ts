import { UpdateWorkspaceSettingsDTO } from '@/types/dto/workspaceSettings.dto'
import { BaseService } from '@api/core/services/base.service'
import { PoliciesService } from '@api/core/services/policies.service'
import { Resource } from '@api/core/types/api'
import { UserAction } from '@api/core/types/user'
import { Prisma, PrismaClient } from '@prisma/client'

export class WorkspaceSettingsService extends BaseService {
  async getWorkspaceSettings() {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Read, Resource.WorkspaceSetting)

    const workspaceId = this.user.workspaceId
    const workspaceSetting = await this.db.workspaceSetting.findUnique({ where: { workspaceId } })

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

  // Updates the workspace settings and cascades the new client defaults to every existing
  // client's view settings atomically, so a cascade failure rolls back the settings change too.
  async overrideExistingClientViewSettings({ data }: { data: UpdateWorkspaceSettingsDTO }) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Update, Resource.WorkspaceSetting)

    const workspaceId = this.user.workspaceId

    return this.db.$transaction(async (tx) => {
      this.setTransaction(tx as PrismaClient)
      try {
        const previous = await this.db.workspaceSetting.findUnique({ where: { workspaceId } })
        const updated = await this.updateWorkspaceSettings(data)

        const cascade: Prisma.ViewSettingUpdateManyMutationInput = {}

        if (data.clientDefaultViewMode != null && data.clientDefaultViewMode !== previous?.clientDefaultViewMode) {
          cascade.viewMode = data.clientDefaultViewMode
        }
        // clientHideSubtasks is the inverse of the per-user showSubtasks flag.
        if (data.clientHideSubtasks != null && data.clientHideSubtasks !== previous?.clientHideSubtasks) {
          cascade.showSubtasks = !data.clientHideSubtasks
        }

        if (Object.keys(cascade).length > 0) {
          await this.db.viewSetting.updateMany({
            where: { workspaceId, clientId: { not: null } },
            data: cascade,
          })
        }

        return updated
      } finally {
        // Always restore the shared db handle, even if the cascade throws.
        this.unsetTransaction()
      }
    })
  }
}
