import { Uuid } from '@/types/common'
import APIError from '@api/core/exceptions/api'
import authenticate from '@api/core/utils/authenticate'
import { ValidateCountService } from '@api/notification/validate-count/validateCount.service'
import httpStatus from 'http-status'
import { NextRequest, NextResponse } from 'next/server'

export const validateCount = async (req: NextRequest) => {
  const user = await authenticate(req)
  const clientId = Uuid.safeParse(user.clientId)
  const companyId = Uuid.safeParse(user.companyId)
  if (!clientId.success || !companyId.success) {
    // safe parse returns success as false if the uuid is invalid
    throw new APIError(httpStatus.UNAUTHORIZED, 'Only client users are allowed to access this feature')
  }

  const validateCountService = new ValidateCountService(user)
  await validateCountService.fixClientNotificationCount(clientId.data, companyId.data, user.workspaceId)

  return NextResponse.json({ message: 'Validated counts successfully' })
}
