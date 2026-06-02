import { supabaseAnonKey, supabaseProjectUrl } from '@/config'
import { createClient, processLock, type SupabaseClient as SupabaseJSClient } from '@supabase/supabase-js'

// We use Supabase purely for realtime with the anon key (auth is handled by Copilot),
// so there is no user session to persist or coordinate across tabs.
const authOptions = {
  auth: {
    lock: processLock,
    persistSession: false,
    autoRefreshToken: false,
  },
}

export const supabase = createClient(supabaseProjectUrl, supabaseAnonKey, authOptions)

class SupabaseClient {
  private static client: SupabaseJSClient
  private static isInitialized = false

  private constructor() {}

  static getInstance(): SupabaseJSClient {
    if (!this.client) {
      if (!this.isInitialized) {
        this.client = createClient(supabaseProjectUrl, supabaseAnonKey, authOptions)
        this.isInitialized = true
      }
    }

    return this.client
  }
}

export default SupabaseClient
