import { NextRequest, NextResponse } from 'next/server'
import authenticate from '@api/core/utils/authenticate'
import { ViewSettingsService } from '@api/view-settings/viewSettings.service'
import { CreateViewSettingsSchema } from '@/types/dto/viewSettings.dto'

export const getViewSetting = async (req: NextRequest) => {
  const user = await authenticate(req)

  const viewSettingsService = new ViewSettingsService(user)
  const viewSetting = await viewSettingsService.getViewSettingsForUser()

  return NextResponse.json(viewSetting)
}

export const updateViewSetting = async (req: NextRequest) => {
  const user = await authenticate(req)

  const data = CreateViewSettingsSchema.parse(await req.json())

  const viewSettingsService = new ViewSettingsService(user)
  const newViewSetting = await viewSettingsService.createOrUpdateViewSettings(data)

  return NextResponse.json(newViewSetting)
}
