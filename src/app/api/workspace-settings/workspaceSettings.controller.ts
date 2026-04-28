import { NextRequest, NextResponse } from 'next/server'
import authenticate from '@api/core/utils/authenticate'
import { WorkspaceSettingsService } from '@api/workspace-settings/workspaceSettings.service'
import { UpdateWorkspaceSettingsSchema } from '@/types/dto/workspaceSettings.dto'
import { unstable_noStore as noStore } from 'next/cache'

export const getWorkspaceSettings = async (req: NextRequest) => {
  noStore()
  const user = await authenticate(req)

  const workspaceSettingsService = new WorkspaceSettingsService(user)
  const workspaceSetting = await workspaceSettingsService.getWorkspaceSettings()

  return NextResponse.json(workspaceSetting)
}

export const updateWorkspaceSettings = async (req: NextRequest) => {
  const user = await authenticate(req)

  const data = UpdateWorkspaceSettingsSchema.parse(await req.json())

  const workspaceSettingsService = new WorkspaceSettingsService(user)
  const workspaceSetting = await workspaceSettingsService.updateWorkspaceSettings(data)

  return NextResponse.json(workspaceSetting)
}
