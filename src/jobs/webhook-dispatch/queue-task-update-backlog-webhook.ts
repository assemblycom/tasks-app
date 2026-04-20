import User from '@/app/api/core/models/User.model'
import { PublicTaskSerializer } from '@/app/api/tasks/public/public.serializer'
import DBClient from '@/lib/db'
import { DISPATCHABLE_EVENT } from '@/types/webhook'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { LogStatus } from '@prisma/client'
import { logger, task } from '@trigger.dev/sdk/v3'

export const queueTaskUpdatedBacklogWebhook = task({
  id: 'queue-task-update-backlog-webhook',
  maxDuration: 10,
  queue: { concurrencyLimit: 25 },
  run: async (payload: { taskId: string; user: User }, { ctx }) => {
    logger.log('Processing task update backlog to dispatch webhook', { payload, ctx })

    // Mark all waiting backlogs as processing
    const db = DBClient.getInstance()
    const updatedBacklogs = await db.taskUpdateBacklog.updateMany({
      where: { taskId: payload.taskId },
      data: { status: LogStatus.processing },
    })

    // Extract the latest task data
    const task = await db.task.findFirst({
      where: { id: payload.taskId },
      include: {
        workflowState: true,
        attachments: true,
      },
    })
    if (!task) {
      throw new Error('Failed to find task for task update backlog webhook')
    }

    // Dispatch webhooks
    const copilot = new CopilotAPI(payload.user.token)
    await copilot.dispatchWebhook(DISPATCHABLE_EVENT.TaskUpdated, {
      payload: await PublicTaskSerializer.serialize(task),
      workspaceId: payload.user.workspaceId,
      assemblyMetadata: payload.user.assemblyMetadata,
    })

    // Hard delete processed backlogs
    await db.$executeRaw`
      DELETE FROM "TaskUpdateBacklogs"
      WHERE "taskId" = ${payload.taskId}::uuid
        AND "status" = ${LogStatus.processing}::"LogStatus"
    `

    return {
      message: `task.updated webhook was dispatched for ${updatedBacklogs.count} transactions`,
    }
  },
})
