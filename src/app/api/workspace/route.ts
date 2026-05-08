import { getMemoizedWorkspace } from '@/utils/copilotMemo'
import authenticate from '@api/core/utils/authenticate'
import { withErrorHandler } from '@api/core/utils/withErrorHandler'
import { NextRequest, NextResponse } from 'next/server'

const getWorkspace = async (req: NextRequest) => {
  const user = await authenticate(req)
  const workspace = await getMemoizedWorkspace(user.token)
  return NextResponse.json(workspace)
}

export const GET = withErrorHandler(getWorkspace)
