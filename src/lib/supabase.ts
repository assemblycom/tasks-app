import { supabaseAnonKey, supabaseProjectUrl, supabaseStorageDomain } from '@/config'
import { createClient, type SupabaseClient as SupabaseJSClient } from '@supabase/supabase-js'

// Realtime + anon REST stay on the Supabase project URL.
export const supabase = createClient(supabaseProjectUrl, supabaseAnonKey)

// Storage (downloads, signed URLs, uploads, moves) goes through the Assembly custom domain when
// configured. Signed-URL tokens sign the path + expiry, not the host, and the custom domain fronts
// the same Supabase backend, so URLs/uploads stay valid. This is a separate client from `supabase`
// so realtime is unaffected. See OUT-3864.
const storageUrl = supabaseStorageDomain || supabaseProjectUrl

// STORAGE-ONLY client. Its URL is `storageUrl` (custom domain || project URL), which may not serve
// WebSockets or anon-REST. Do NOT use this for realtime channels or auth — use the `supabase` export
// above (pinned to the project URL) for those.
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
