import { buildNextRequest } from '@api/tests/__utils__/testUtils'
import httpStatus from 'http-status'
import { mockCopilotAPI } from '@api/tests/__mocks__/CopilotAPI.mock'
import APIError from '@api/core/exceptions/api'
import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from '@api/core/utils/withErrorHandler'
import { CopilotApiError } from '@/types/CopilotApiError'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { z } from 'zod'

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation((token: string) => mockCopilotAPI(token)),
}))

describe('withErrorHandler util', () => {
  let req: NextRequest
  const buildPrismaError = (code: string) =>
    new PrismaClientKnownRequestError('Prisma known request error', {
      code,
      clientVersion: 'test',
      meta: {},
    })

  beforeEach(() => {
    jest.clearAllMocks()
    req = buildNextRequest(`/?token=iu-token`)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
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
    expect(console.error).not.toHaveBeenCalled()
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
    expect(console.error).not.toHaveBeenCalled()
  })

  it('catches and builds proper response for CopilotApiError', async () => {
    const handler = async (_req: NextRequest, _params: any) => {
      throw new CopilotApiError(httpStatus.UNAUTHORIZED, { message: 'Please provide a valid token' })
    }

    const nextResponse = await withErrorHandler(handler)(req, null)
    const response = await nextResponse.json()
    expect(response.error).toBe('Please provide a valid token')
    expect(nextResponse.status).toBe(httpStatus.UNAUTHORIZED)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('catches and builds proper response for Prisma not found errors without logging', async () => {
    const handler = async (_req: NextRequest, _params: any) => {
      throw buildPrismaError('P2025')
    }

    const nextResponse = await withErrorHandler(handler)(req, null)
    const response = await nextResponse.json()
    expect(response.error).toBe('The requested resource was not found')
    expect(nextResponse.status).toBe(httpStatus.NOT_FOUND)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('catches and builds proper response for invalid Prisma UUID errors without logging', async () => {
    const handler = async (_req: NextRequest, _params: any) => {
      throw buildPrismaError('P2023')
    }

    const nextResponse = await withErrorHandler(handler)(req, null)
    const response = await nextResponse.json()
    expect(response.error).toBe('The requested resource was not found')
    expect(nextResponse.status).toBe(httpStatus.NOT_FOUND)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('logs unexpected errors', async () => {
    const error = new Error('boom')
    const handler = async (_req: NextRequest, _params: any) => {
      throw error
    }

    const nextResponse = await withErrorHandler(handler)(req, null)
    const response = await nextResponse.json()
    expect(response.error).toBe('Something went wrong')
    expect(nextResponse.status).toBe(httpStatus.BAD_REQUEST)
    expect(console.error).toHaveBeenCalledWith(error)
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
