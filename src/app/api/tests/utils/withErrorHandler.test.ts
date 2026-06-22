import { buildNextRequest } from '@api/tests/__utils__/testUtils'
import httpStatus from 'http-status'
import { mockCopilotAPI } from '@api/tests/__mocks__/CopilotAPI.mock'
import APIError from '@api/core/exceptions/api'
import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@api/core/utils/withErrorHandler'
import { CopilotApiError } from '@/types/CopilotApiError'
import { z } from 'zod'

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation((token: string) => mockCopilotAPI(token)),
}))

describe('withErrorHandler util', () => {
  let req: NextRequest
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
    req = buildNextRequest(`/?token=iu-token`)
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('catches and builds proper response for APIError', async () => {
    const handler = async (_req: NextRequest, _params: any) => {
      throw new APIError(httpStatus.UNAUTHORIZED, 'Please provide a valid token')
    }

    const nextResponse = await withErrorHandler(handler)(req, null)
    const response = await nextResponse.json()
    expect(response.error).toBe('Please provide a valid token')
    expect(nextResponse.status).toBe(httpStatus.UNAUTHORIZED)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('catches and builds proper response for ZodError', async () => {
    const handler = async (_req: NextRequest, _params: any) => {
      z.string().parse(420)
      return NextResponse.json('')
    }

    const nextResponse = await withErrorHandler(handler)(req, null)
    const response = await nextResponse.json()
    expect(response.error[0].expected).toBe('string')
    expect(response.error[0].received).toBe('number')
    expect(nextResponse.status).toBe(httpStatus.UNPROCESSABLE_ENTITY)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('catches and builds proper response for CopilotApiError', async () => {
    const handler = async (_req: NextRequest, _params: any) => {
      throw new CopilotApiError(httpStatus.UNAUTHORIZED, { message: 'Please provide a valid token' })
    }

    const nextResponse = await withErrorHandler(handler)(req, null)
    const response = await nextResponse.json()
    expect(response.error).toBe('Please provide a valid token')
    expect(nextResponse.status).toBe(httpStatus.UNAUTHORIZED)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('logs server-side API errors', async () => {
    const handler = async (_req: NextRequest, _params: any) => {
      throw new APIError(httpStatus.INTERNAL_SERVER_ERROR, 'Database unavailable')
    }

    const nextResponse = await withErrorHandler(handler)(req, null)
    const response = await nextResponse.json()
    expect(response.error).toBe('Database unavailable')
    expect(nextResponse.status).toBe(httpStatus.INTERNAL_SERVER_ERROR)
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
  })

  it('returns proper response if no errors are encountered', async () => {
    const handler = async (_req: NextRequest, _params: any) => {
      return NextResponse.json({ message: 'Yay!' })
    }

    const nextResponse = await withErrorHandler(handler)(req, null)
    const response = await nextResponse.json()
    expect(response.message).toBe('Yay!')
    expect(nextResponse.status).toBe(httpStatus.OK)
  })
})
