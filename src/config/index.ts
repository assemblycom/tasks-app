export const copilotAPIKey = process.env.COPILOT_API_KEY || ''
export const tasksAppId = process.env.COPILOT_TASKS_APP_ID || ''

export const apiUrl =
  process.env.VERCEL_ENV === 'production'
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'staging'
      ? `https://${process.env.VERCEL_URL}`
      : `http://${process.env.VERCEL_URL}`

export const isProd = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
export const SentryConfig = {
  DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
}
export const advancedFeatureFlag = !!+(process.env.NEXT_PUBLIC_ADVANCED_FEATURES_FLAG || 0)

export const supabaseProjectUrl = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL || ''
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
export const supabaseBucket = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || ''
export const cronSecret = process.env.CRON_SECRET || ''
export const APP_ID = process.env.COPILOT_APP_API_KEY

export const ScrapImageExpiryPeriod = +(process.env.SCRAP_IMAGE_EXPIRY_PERIOD || '604800000')

export const showQueries = (() => {
  if (isProd) return false
  if (process.env.PRISMA_SHOW_QUERIES === '0') return false
  return true
})()

export const assemblyApiDomain = process.env.NEXT_PUBLIC_ASSEMBLY_API_DOMAIN ?? ''
