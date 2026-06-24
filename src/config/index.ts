import z from 'zod'

export const copilotAPIKey = process.env.COPILOT_API_KEY || ''

function getAppUrl() {
  const vercelEnv = process.env.VERCEL_ENV || 'development'
  if (vercelEnv === 'production') {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }

  if (process.env.VERCEL_BRANCH_URL) {
    return `https://${process.env.VERCEL_BRANCH_URL}`
  }

  const url = process.env.VERCEL_URL
  if (url && url.startsWith('http')) {
    return url
  }

  const isVercelDeployment = vercelEnv === 'preview' || vercelEnv === 'staging'

  return `${isVercelDeployment ? 'https' : 'http'}://${url}`
}

export const apiUrl = getAppUrl()

export const isProd = process.env.NEXT_PUBLIC_VERCEL_ENV === 'production'
export const SentryConfig = {
  DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
}
export const advancedFeatureFlag = !!+(process.env.NEXT_PUBLIC_ADVANCED_FEATURES_FLAG || 0)

export const supabaseProjectUrl = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL || ''
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
export const supabaseBucket = process.env.NEXT_PUBLIC_SUPABASE_BUCKET || ''
// Assembly custom domain fronting Supabase storage (e.g. https://task-files.assembly.com). Storage
// is served through it so downloads aren't blocked by clients that allowlist only Assembly domains
// (OUT-3864). Empty falls back to the project URL, so behaviour is unchanged until it's configured.
export const supabaseStorageDomain = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_DOMAIN || ''
export const cronSecret = process.env.CRON_SECRET || ''

const parseOptionalUuid = (value?: string) => {
  const parsed = z.string().uuid().safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export const APP_ID = parseOptionalUuid(process.env.COPILOT_APP_ID ?? process.env.COPILOT_APP_API_KEY)

export const ScrapImageExpiryPeriod = +(process.env.SCRAP_IMAGE_EXPIRY_PERIOD || '604800000')

export const showQueries = (() => {
  if (isProd) return false
  if (process.env.PRISMA_SHOW_QUERIES === '0') return false
  return true
})()

export const assemblyApiDomain = z.string().url().parse(process.env.NEXT_PUBLIC_ASSEMBLY_API_DOMAIN)
