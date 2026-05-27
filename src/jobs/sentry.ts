import 'server-only'

import * as Sentry from '@sentry/nextjs'

// Trigger.dev runs jobs in a standalone Node process, separate from the Next.js server, so
// `sentry.server.config.ts` (loaded via instrumentation.ts) never executes here — without
// this init, `Sentry.captureException` from a job would be a silent no-op. We reuse the
// already-installed @sentry/nextjs (its exports delegate to @sentry/node on the server)
// rather than pulling in a second SDK. Module-level side effect: ESM evaluates this once,
// the first time a job imports it, which is exactly when we need the client ready.
const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    // Keep the runtime lean: targeted captureException calls don't need the full default
    // integration set (matches Trigger.dev's documented Sentry setup).
    defaultIntegrations: false,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    ignoreErrors: [/fetch failed/i],
  })
}

export { Sentry }
