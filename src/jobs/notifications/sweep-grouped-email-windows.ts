import 'server-only'

import DBClient from '@/lib/db'
import { logger, schedules } from '@trigger.dev/sdk/v3'

import { enqueueGroupedEmailFlush } from './flush-grouped-email'

type StaleWindow = { workspaceId: string; windowKey: string }

export const sweepGroupedEmailWindowsRun = async () => {
  const db = DBClient.getInstance()

  const pruned = await db.$executeRaw`DELETE FROM "GroupedEmailEvents" WHERE "createdAt" < now() - interval '15 days'`

  // Safe because a flush run is capped at maxDuration 60s, so a claim this old cannot belong
  // to a live run — releasing it can never race a send.
  const released = await db.$executeRaw`
    UPDATE "GroupedEmailEvents" SET "batchId" = NULL
    WHERE "sentAt" IS NULL AND "batchId" IS NOT NULL AND "createdAt" < now() - interval '30 minutes'`

  // Past 24h a window has already been re-enqueued ~24 times; leave it for the prune rather
  // than retrying a poisoned window hourly for a fortnight.
  const stale = await db.$queryRaw<StaleWindow[]>`
    SELECT DISTINCT "workspaceId", "windowKey" FROM "GroupedEmailEvents"
    WHERE "sentAt" IS NULL
      AND "createdAt" < now() - interval '30 minutes'
      AND "createdAt" > now() - interval '24 hours'`

  for (const { workspaceId, windowKey } of stale) {
    await enqueueGroupedEmailFlush({ workspaceId, windowKey })
  }

  logger.log('sweep-grouped-email-windows: done', { requeued: stale.length, released, pruned })
  return { requeued: stale.length, released, pruned }
}

export const sweepGroupedEmailWindows = schedules.task({
  id: 'sweep-grouped-email-windows',
  cron: '0 * * * *',
  maxDuration: 300,
  run: sweepGroupedEmailWindowsRun,
})
