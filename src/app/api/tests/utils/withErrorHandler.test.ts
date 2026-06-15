import { buildNextRequest } from '@api/tests/__utils__/testUtils'
import httpStatus from 'http-status'
import { mockCopilotAPI } from '@api/tests/__mocks__/CopilotAPI.mock'
import APIError from '@api/core/exceptions/api'
import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@api/core/utils/withErrorHandler'
import { CopilotApiError } from '@/types/CopilotApiError'
import { z } from 'zod'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation((token: string) => mockCopilotAPI(token)),
}))

describe('withErrorHandler util', () => {
  let req: NextRequest

  beforeEach(() => {
    jest.clearAllMocks()
    req = buildNextRequest(`/?token=iu-token`)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('catches and builds proper response for APIError', async () => {
    const handler = async (_req: NextRequest, _params: any) => {
      throw new APIError(httpStatus.UNAUTHORIZED, 'Please provide a valid token')
    }

    const nextResponse = await withErrorHandler(handler)(req, null)
    const response = await nextResponse.json()
    expect(response.error).toBe('Please provide a valid token')
    expect(nextResponse.status).toBe(httpStatus.UNAUTHORIZED)
  })

  it('catches and builds proper response for ZodError', async () => {
    const handler = async (_req: NextRequest, _params: any) => {
      z.string().parse(420)
      return NextResponse.json('')
    }

    const nextResponse = await withErrorHandler(handler)(req, null)
    const response = await nextResponse.json()
    expect(response.error).toBe('Expected string, received number')
    expect(nextResponse.status).toBe(httpStatus.UNPROCESSABLE_ENTITY)
  })

  it('catches Prisma not found errors without logging them as server errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
    const handler = async (_req: NextRequest, _params: any) => {
      throw new PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.22.0',
      })
    }

    const nextResponse = await withErrorHandler(handler)(req, null)
    const response = await nextResponse.json()
    expect(response.error).toBe('The requested resource was not found')
    expect(nextResponse.status).toBe(httpStatus.NOT_FOUND)
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('continues logging unexpected errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
    const handler = async (_req: NextRequest, _params: any) => {
      throw new Error('Unexpected failure')
    }

    const nextResponse = await withErrorHandler(handler)(req, null)
    const response = await nextResponse.json()
    expect(response.error).toBe('Something went wrong')
    expect(nextResponse.status).toBe(httpStatus.BAD_REQUEST)
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'Unexpected failure' }))
  })

  it('catches and builds proper response for CopilotApiError', async () => {
    const handler = async (_req: NextRequest, _params: any) => {
      throw new CopilotApiError(httpStatus.UNAUTHORIZED, { message: 'Please provide a valid token' })
    }

    const nextResponse = await withErrorHandler(handler)(req, null)
    const response = await nextResponse.json()
    expect(response.error).toBe('Please provide a valid token')
    expect(nextResponse.status).toBe(httpStatus.UNAUTHORIZED)
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
