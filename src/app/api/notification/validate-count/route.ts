import { withErrorHandler } from '@api/core/utils/withErrorHandler'
import { validateCount } from '@api/notification/validate-count/validateCount.controller'

export const maxDuration = 300

export const GET = withErrorHandler(validateCount)
