import 'server-only'

import DBClient from '@/lib/db'
import { logger, schedules } from '@trigger.dev/sdk/v3'

import { enqueueGroupedEmailFlush } from './flush-grouped-email'

type StaleWindow = { workspaceId: string; windowKey: string }

export const sweepGroupedEmailWindowsRun = async () => {
  const db = DBClient.getInstance()

  const pruned = await db.$executeRaw`DELETE FROM "GroupedEmailEvents" WHERE "createdAt" < now() - interval '15 days'`

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

  logger.log('sweep-grouped-email-windows: done', { requeued: stale.length, pruned })
  return { requeued: stale.length, pruned }
}

export const sweepGroupedEmailWindows = schedules.task({
  id: 'sweep-grouped-email-windows',
  cron: '0 * * * *',
  maxDuration: 300,
  run: sweepGroupedEmailWindowsRun,
})
