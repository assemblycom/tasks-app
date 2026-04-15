import { TokenSchema } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import APIError from '@api/core/exceptions/api'
import User from '@api/core/models/User.model'
import httpStatus from 'http-status'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withRetry } from './withRetry'
import * as Sentry from '@sentry/nextjs'

export const _authenticateWithToken = async (token: string, customApiKey?: string): Promise<User> => {
  let copilotClient: CopilotAPI
  try {
    copilotClient = new CopilotAPI(token, customApiKey)
  } catch (err) {
    throw new APIError(httpStatus.UNAUTHORIZED, 'Failed to authenticate token')
  }

  const payload = TokenSchema.safeParse(await copilotClient.getTokenPayload())

  if (!payload.success) {
    throw new APIError(httpStatus.UNAUTHORIZED, 'Failed to authenticate token')
  }

  // Set sentry user for better tracking
  Sentry.setUser({ id: payload.data.internalUserId || `${payload.data.clientId}:${payload.data.companyId}` })

  return new User(token, payload.data)
}
export const authenticateWithToken = (...args: unknown[]) => withRetry(_authenticateWithToken, args)

/**
 * Token parser and authentication util
 *
 * `authenticate` takes in the current request, parses the "token" searchParam from it,
 * uses `CopilotAPI` to check if the user token is valid
 * and finally returns an instance of `User` that is associated with this request
 */
const authenticate = async (req: NextRequest) => {
  // Fetch token from search param and validate it
  const token = req.nextUrl.searchParams.get('token')
  const tokenParsed = z.string().safeParse(token)
  if (!tokenParsed.success || !tokenParsed.data) {
    throw new APIError(httpStatus.UNAUTHORIZED, 'Please provide a valid token')
  }

  // Parse token payload from valid token
  const user = await authenticateWithToken(tokenParsed.data)

  // Capture assembly proxy metadata headers, falling back to browser headers
  // const isPublicRoute = req.nextUrl.pathname.includes('/public/')
  user.assemblyMetadata = {
    source: req.headers.get('x-assembly-source') ?? 'platform', //hardcode platform for now.
    clientIp: req.headers.get('x-assembly-client-ip') ?? req.headers.get('x-real-ip') ?? undefined,
    userAgent: req.headers.get('x-assembly-user-agent') ?? req.headers.get('user-agent') ?? undefined,
  }

  return user
}

export default authenticate
