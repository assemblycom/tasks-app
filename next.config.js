const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheMaxMemorySize: 500 * 1024 * 1024,
  cacheComponents: true,
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.jsx',
      },
    },
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
}

module.exports = withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: 'copilot-platforms',
  project: 'tasks',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase server load as well as your hosting bill but prevent ad-blockers from blocking error repotrs
  tunnelRoute: '/tel',

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  automaticVercelMonitors: true,
})
