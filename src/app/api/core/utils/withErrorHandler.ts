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

const buildErrorResponse = (error: unknown): ErrorResponse => {
  // Default status and message for JSON error response
  let status: number = (error as StatusableError).status || httpStatus.BAD_REQUEST
  let message: string | ZodFormattedError<string> = (error as MessagableError).body?.message || 'Something went wrong'
  let errors: unknown[] | undefined = undefined
  let shouldLog = true

  // Build a proper response based on the type of Error encountered
  if (error instanceof ZodError) {
    status = httpStatus.UNPROCESSABLE_ENTITY
    const flattened = error.flatten()
    const allMessages = [...flattened.formErrors, ...Object.values(flattened.fieldErrors).flat()].filter(Boolean)
    message = allMessages[0] || (error.format() as ZodFormattedError<string>)
    shouldLog = false
  } else if (error instanceof CopilotApiError) {
    status = error.status || status
    message = error.body.message || message
    shouldLog = status >= httpStatus.INTERNAL_SERVER_ERROR
  } else if (error instanceof APIError) {
    status = error.status
    message = error.message || message
    errors = error.errors
    shouldLog = status >= httpStatus.INTERNAL_SERVER_ERROR
  } else if (error instanceof PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      // Code for NOT FOUND in Prisma
      status = httpStatus.NOT_FOUND
      message = 'The requested resource was not found'
      shouldLog = false
    }
  }

  return { status, message, errors, shouldLog }
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
    // Execute the handler wrapped in a try... catch block
    try {
      return await handler(req, params)
    } catch (error: unknown) {
      const { status, message, errors, shouldLog } = buildErrorResponse(error)

      if (shouldLog) {
        console.error(error instanceof ZodError ? error.format() : error)
      }

      return NextResponse.json({ error: message, errors }, { status })
    }
  }
}
