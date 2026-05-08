import { PublicTaskSerializer } from '@/app/api/tasks/public/public.serializer'
import DBClient from '@/lib/db'
import { DISPATCHABLE_EVENT } from '@/types/webhook'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { logger, task } from '@trigger.dev/sdk/v3'

export type DispatchTaskArchivedWebhookPayload = {
  taskId: string
  workspaceId: string
}

// Dispatches a single task.archived webhook. The auto-archive cron enqueues one of these
// per archived parent so webhook delivery runs durably under Trigger.dev's queue (with its
// own retry/backoff) instead of inside the cron's wall-clock budget. Decoupling lets the
// cron finish in DB-only time and isolates a 429 or network error to a single delivery
// rather than a whole workspace's batch.
export const dispatchTaskArchivedWebhook = task({
  id: 'dispatch-task-archived-webhook',
  // Concurrency cap = global throttle for Copilot. Each run is one DB fetch + one webhook
  // POST (~500ms–1s), so ~5 concurrent ≈ 5–10 req/s — matches the prior in-loop bottleneck
  // and keeps us under Copilot's rate ceiling. Trigger.dev queues the overflow.
  queue: { concurrencyLimit: 5 },
  retry: {
    maxAttempts: 5,
    factor: 2,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 30_000,
    randomize: true,
  },
  maxDuration: 30,
  run: async ({ taskId, workspaceId }: DispatchTaskArchivedWebhookPayload) => {
    const db = DBClient.getInstance()
    // CopilotAPI authenticates with `${workspaceId}/${apiKey}` from env, not a user token,
    // so an empty token is correct here. Requires COPILOT_ENV on the Trigger.dev runtime
    // (`local` for prod, `__SECRET_STAGING__` for staging) — without it the SDK throws.
    const copilot = new CopilotAPI('')

    const archivedTask = await db.task.findFirst({
      where: { id: taskId },
      include: { workflowState: true, attachments: true },
    })
    if (!archivedTask) {
      // Task hard-deleted between archive and dispatch. Returning successfully prevents
      // Trigger.dev from retrying — there's nothing to deliver.
      logger.log('Skipping task.archived webhook: task no longer exists', { taskId, workspaceId })
      return { skipped: true as const, taskId, workspaceId }
    }

    await copilot.dispatchWebhook(DISPATCHABLE_EVENT.TaskArchived, {
      workspaceId,
      payload: await PublicTaskSerializer.serialize(archivedTask),
    })

    return { skipped: false as const, taskId, workspaceId }
  },
})
