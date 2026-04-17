import httpStatus from 'http-status'
import z from 'zod'
import APIError from '@api/core/exceptions/api'
import { PublicResource } from '@api/core/types/public'

/**
 * Validates that an ID parameter is a valid UUID.
 *
 * This utility is intended to be used in service-layer retrieval flows
 * where an ID is passed via API params. If the ID is not a valid UUID,
 * it throws a 404 error immediately instead of letting the request hit Prisma,
 * thereby avoiding Prisma P2023 errors and providing a controlled,
 * consistent API response. Mainly used for public APIs.
 *
 * @param id - The resource ID to validate
 * @param resourceType - The type of resource being retrieved
 *
 * @throws {APIError} 404 NOT_FOUND if the ID is not a valid UUID
 */
export const ValidateUuid = (id: string, resourceType: PublicResource) => {
  if (!z.string().uuid().safeParse(id).success) {
    throw new APIError(httpStatus.NOT_FOUND, `The requested ${resourceType} was not found`)
  }
}
