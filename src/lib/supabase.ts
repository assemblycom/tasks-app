import { supabaseAnonKey, supabaseProjectUrl } from '@/config'
import { createClient, type SupabaseClient as SupabaseJSClient, type SupabaseClientOptions } from '@supabase/supabase-js'

type SupabaseAuthOptions = NonNullable<SupabaseClientOptions<'public'>['auth']>

const supabaseAuthLock: NonNullable<SupabaseAuthOptions['lock']> = async (_name, _acquireTimeout, fn) => fn()

const supabaseClientOptions: SupabaseClientOptions<'public'> = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
    lock: supabaseAuthLock,
  },
}

export const supabase = createClient(supabaseProjectUrl, supabaseAnonKey, supabaseClientOptions)

class SupabaseClient {
  private static client: SupabaseJSClient
  private static isInitialized = false

  private constructor() {}

  static getInstance(): SupabaseJSClient {
    if (!this.client) {
      if (!this.isInitialized) {
        this.client = createClient(supabaseProjectUrl, supabaseAnonKey, supabaseClientOptions)
        this.isInitialized = true
      }
    }

    return this.client
  }
}

export default SupabaseClient
