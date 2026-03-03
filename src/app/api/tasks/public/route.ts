import { withErrorHandler } from '@api/core/utils/withErrorHandler'
import { withExecTimeCap } from '@api/core/utils/withExecTimeCap'
import { createTaskPublic, getAllTasksPublic } from '@api/tasks/public/public.controller'

export const maxDuration = 300

export const GET = withErrorHandler(getAllTasksPublic)
export const POST = withExecTimeCap(withErrorHandler(createTaskPublic), 10_000)
