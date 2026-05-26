import { SupabaseService } from '@/app/api/core/services/supabase.service'
import { supabaseBucket } from '@/config'
import { signedUrlTtl } from '@/constants/attachments'

export const getSignedUrl = async (filePath: string) => {
  const supabase = new SupabaseService()
  const { data } = await supabase.supabase.storage.from(supabaseBucket).createSignedUrl(filePath, signedUrlTtl)

  const url = data?.signedUrl

  return url
} // used to replace urls for images in task body

// Public bucket URL — not actually downloadable for a private bucket but still contains the
// file path under `/media/` so downstream parsers (getFilePathFromUrl) can extract it. Useful
// as a fallback when signing fails: callers can still embed the URL in a task body, and the
// post-creation sweep will re-sign it against the task-scoped path.
export const getUnsignedUrl = (filePath: string): string => {
  const supabase = new SupabaseService()
  const { data } = supabase.supabase.storage.from(supabaseBucket).getPublicUrl(filePath)
  return data.publicUrl
}

export const createSignedUrls = async (filePaths: string[]) => {
  const supabase = new SupabaseService()
  const { data, error } = await supabase.supabase.storage.from(supabaseBucket).createSignedUrls(filePaths, signedUrlTtl)
  if (error) {
    throw new Error(error.message)
  }
  return data
}

export const getFileNameFromSignedUrl = (url: string) => {
  // Aggressive regex that selects string from last '/'' to url param (starting with ?)
  const regex = /.*\/([^\/\?]+)(?:\?.*)?$/
  const match = url.match(regex)
  return match ? match[1] : ''
}
