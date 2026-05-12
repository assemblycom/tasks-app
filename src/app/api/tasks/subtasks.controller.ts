import { IdParams } from '@api/core/types/api'
import authenticate from '@api/core/utils/authenticate'
import { SubtaskService } from '@api/tasks/subtasks.service'
import { NextRequest, NextResponse } from 'next/server'

export const getSubtaskCount = async (req: NextRequest, { params }: IdParams) => {
  const { id } = await params
  const user = await authenticate(req)
  const subtaskService = new SubtaskService(user)
  return NextResponse.json(await subtaskService.getSubtaskStatus(id))
}
