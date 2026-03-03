import { withErrorHandler } from '@api/core/utils/withErrorHandler'
import { validateCount } from '@api/notification/validate-count/validateCount.controller'

export const maxDuration = 300
// Don't let NextJS do something stupid like cache the JSON response for all users
export const revalidate = 0

export const GET = withErrorHandler(validateCount)
