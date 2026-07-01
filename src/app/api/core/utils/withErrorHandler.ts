import { CopilotApiError, MessagableError, StatusableError } from '@/types/CopilotApiError'
import APIError from '@api/core/exceptions/api'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import httpStatus from 'http-status'
import { NextRequest, NextResponse } from 'next/server'
import { ZodError, ZodFormattedError } from 'zod'

export type RequestHandler = (req: NextRequest, params: any) => Promise<NextResponse>

type ErrorResponse = {
  status: number
  message: string | ZodFormattedError<string>
  errors?: unknown[]
  shouldLog: boolean
}

const getZodErrorMessage = (error: ZodError) => {
  const flattened = error.flatten()
  const allMessages = [...flattened.formErrors, ...Object.values(flattened.fieldErrors).flat()].filter(Boolean)

  return allMessages[0] || (error.format() as ZodFormattedError<string>)
}

const shouldLogStatus = (status: number) => status >= httpStatus.INTERNAL_SERVER_ERROR

const getPrismaErrorResponse = (error: PrismaClientKnownRequestError): ErrorResponse => {
  if (error.code === 'P2025' || error.code === 'P2023') {
    return {
      status: httpStatus.NOT_FOUND,
      message: 'The requested resource was not found',
      shouldLog: false,
    }
  }

  return {
    status: httpStatus.BAD_REQUEST,
    message: 'Something went wrong',
    shouldLog: false,
  }
}

const getErrorResponse = (error: unknown): ErrorResponse => {
  if (error instanceof ZodError) {
    return {
      status: httpStatus.UNPROCESSABLE_ENTITY,
      message: getZodErrorMessage(error),
      shouldLog: false,
    }
  }

  if (error instanceof CopilotApiError) {
    const status = error.status || httpStatus.BAD_REQUEST

    return {
      status,
      message: error.body.message || 'Something went wrong',
      shouldLog: shouldLogStatus(status),
    }
  }

  if (error instanceof APIError) {
    return {
      status: error.status,
      message: error.message || 'Something went wrong',
      errors: error.errors,
      shouldLog: shouldLogStatus(error.status),
    }
  }

  if (error instanceof PrismaClientKnownRequestError) {
    return getPrismaErrorResponse(error)
  }

  return {
    status: (error as StatusableError).status || httpStatus.BAD_REQUEST,
    message: (error as MessagableError).body?.message || 'Something went wrong',
    shouldLog: true,
  }
}

/**
 * Reusable utility that wraps a given request handler with a global error handler to standardize response structure
 * in case of failures. Catches exceptions thrown from the handler, and returns a formatted error response.
 *
 * @param {RequestHandler} handler - The request handler to wrap.
 * @returns {RequestHandler} The new handler that includes error handling logic.
 * @example
 * const safeHandler = withErrorHandler(async (req: NextRequest) => {
 *   // your request handling logic
 *   if (errorCondition) {
 *     throw new Error("Oh no!")}
 *   return NextResponse.next();
 * });
 *
 * @throws {ZodError} Captures and handles validation errors and responds with status 400 and the issue detail.
 * @throws {CopilotApiError} Captures and handles CopilotAPI errors, uses the error status, and message if available.
 * @throws {APIError} Captures and handles APIError
 */
export const withErrorHandler = (handler: RequestHandler): RequestHandler => {
  return async (req: NextRequest, params: any) => {
    try {
      return await handler(req, params)
    } catch (error: unknown) {
      const { status, message, errors, shouldLog } = getErrorResponse(error)

      if (shouldLog) {
        console.error(error instanceof ZodError ? error.format() : error)
      }

      return NextResponse.json({ error: message, errors }, { status })
    }
  }
}
