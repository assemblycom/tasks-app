import { supabaseAnonKey, supabaseProjectUrl, supabaseStorageDomain } from '@/config'
import { createClient, type SupabaseClient as SupabaseJSClient } from '@supabase/supabase-js'

export const supabase = createClient(supabaseProjectUrl, supabaseAnonKey)

const storageUrl = supabaseStorageDomain || supabaseProjectUrl

class SupabaseClient {
  private static client: SupabaseJSClient
  private static isInitialized = false

  private constructor() {}

  static getInstance(): SupabaseJSClient {
    if (!this.client) {
      if (!this.isInitialized) {
        this.client = createClient(storageUrl, supabaseAnonKey)
        this.isInitialized = true
      }
    }

    return this.client
  }
}

export default SupabaseClient
