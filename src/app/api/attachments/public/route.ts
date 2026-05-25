import { withErrorHandler } from '@api/core/utils/withErrorHandler'
import { withExecTimeCap } from '@api/core/utils/withExecTimeCap'
import { createAttachmentPublic } from '@api/attachments/public/public.controller'

export const maxDuration = 300

export const POST = withErrorHandler(createAttachmentPublic)
