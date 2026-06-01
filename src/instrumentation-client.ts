// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV
const isProd = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
const cefSharpObjectNotFoundRejection = /Object Not Found Matching Id:\d+, MethodName:\w+, ParamCount:\d+/

if (dsn) {
  Sentry.init({
    dsn,

    // Adjust this value in production, or use tracesSampler for greater control
    tracesSampleRate: isProd ? 0.2 : 1,
    profilesSampleRate: 0.1,
    // NOTE: reducing sample only 10% of transactions in prod to get general trends instead of detailed and overfitted data

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,

    // You can remove this option if you're not planning to use the Sentry Session Replay feature:
    // NOTE: Since session replay barely helps us anyways, getting rid of it to reduce some bundle size at least
    // replaysOnErrorSampleRate: 1.0,
    // replaysSessionSampleRate: 0,
    integrations: [
      Sentry.browserTracingIntegration(),
      //   Sentry.replayIntegration({
      // Additional Replay configuration goes in here, for example:
      //     maskAllText: true,
      //     blockAllMedia: true,
      //   }),
    ],

    // CefSharp-based crawlers/link scanners can reject non-Error objects with this message.
    ignoreErrors: [/fetch failed/i, cefSharpObjectNotFoundRejection],

    beforeSend(event) {
      if (!isProd && event.type === undefined) {
        return null
      }
      event.tags = {
        ...event.tags,
        // Adding additional app_env tag for cross-checking
        app_env: isProd ? 'production' : vercelEnv || 'development',
      }
      return event
    },
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
