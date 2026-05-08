import { NextRequest, NextResponse } from 'next/server'
import authenticate from '@api/core/utils/authenticate'
import { ActivityLogService } from '@api/activity-logs/services/activity-log.service'
import { IdParams } from '@api/core/types/api'

export const GET = async (req: NextRequest, props: IdParams) => {
  const params = await props.params

  const { id } = params

  const user = await authenticate(req)

  const activityLogger = new ActivityLogService(user)

  const activity = await activityLogger.get(id)

  return NextResponse.json({ activity })
}
