import { CopilotApiError, MessagableError, StatusableError } from '@/types/CopilotApiError'
import APIError from '@api/core/exceptions/api'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import httpStatus from 'http-status'
import { NextRequest, NextResponse } from 'next/server'
import { ZodError, ZodFormattedError } from 'zod'

export type RequestHandler = (req: NextRequest, params: any) => Promise<NextResponse>

type ErrorResponse = {
  errors?: unknown[]
  message: string | ZodFormattedError<string>
  status: number
}

// P2023 ("Inconsistent column data") covers more than UUIDs (e.g. enum mismatches), so
// only treat it as not-found when the meta message points at a malformed UUID — otherwise
// it stays an unclassified error that logs, rather than being silently hidden as a 404.
const isInvalidUuidError = (error: PrismaClientKnownRequestError) => {
  if (error.code === 'P2010' && error.meta?.code === '22P02') {
    return true
  }

  const metaMessage = error.meta?.message
  return error.code === 'P2023' && typeof metaMessage === 'string' && metaMessage.toLowerCase().includes('uuid')
}

const getPrismaKnownRequestErrorResponse = (error: PrismaClientKnownRequestError): ErrorResponse | null => {
  if (error.code === 'P2025' || isInvalidUuidError(error)) {
    return {
      status: httpStatus.NOT_FOUND,
      message: 'The requested resource was not found',
    }
  }

  return null
}

const normalizeError = (error: unknown): ErrorResponse => {
  const defaultResponse = {
    status: (error as StatusableError).status || httpStatus.BAD_REQUEST,
    message: (error as MessagableError).body?.message || 'Something went wrong',
  }

  if (error instanceof ZodError) {
    const flattened = error.flatten()
    const allMessages = [...flattened.formErrors, ...Object.values(flattened.fieldErrors).flat()].filter(Boolean)

    return {
      status: httpStatus.UNPROCESSABLE_ENTITY,
      message: allMessages[0] || (error.format() as ZodFormattedError<string>),
    }
  }

  if (error instanceof CopilotApiError) {
    return {
      ...defaultResponse,
      status: error.status || defaultResponse.status,
      message: error.body.message || defaultResponse.message,
    }
  }

  if (error instanceof APIError) {
    return {
      status: error.status,
      message: error.message || defaultResponse.message,
      errors: error.errors,
    }
  }

  if (error instanceof PrismaClientKnownRequestError) {
    return getPrismaKnownRequestErrorResponse(error) || defaultResponse
  }

  return defaultResponse
}

const isExpectedPrismaError = (error: unknown) =>
  error instanceof PrismaClientKnownRequestError && getPrismaKnownRequestErrorResponse(error) !== null

const isExpectedClientError = (error: unknown) => {
  return (
    error instanceof ZodError ||
    error instanceof CopilotApiError ||
    error instanceof APIError ||
    isExpectedPrismaError(error)
  )
}

const shouldLogError = (error: unknown, response: ErrorResponse) => {
  if (response.status >= httpStatus.INTERNAL_SERVER_ERROR) {
    return true
  }

  return !isExpectedClientError(error)
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
      const response = normalizeError(error)

      if (shouldLogError(error, response)) {
        console.error(error instanceof ZodError ? error.format() : error)
      } else if (isExpectedPrismaError(error)) {
        // Keep a breadcrumb for mapped Prisma errors (e.g. P2025) without alerting Sentry —
        // a nested-write failure can still signal a real data-integrity issue worth seeing.
        console.warn(error)
      }

      return NextResponse.json({ error: response.message, errors: response.errors }, { status: response.status })
    }
  }
}
