import { createSignedUrls, getSignedUrl } from '@/utils/signUrl'
import { Comment } from '@prisma/client'

// Matches the src of every <img> and the data-src of every attachment tag (`data-type="attachment"`).
// Created per-call: /g regexes carry mutable lastIndex state, so a shared instance would race when
// these helpers run concurrently (e.g. Promise.all over many bodies).
const imgSrcRegex = () => /<img\s+[^>]*src="([^"]+)"[^>]*>/g
const attachmentSrcRegex = () => /<\s*[a-zA-Z]+\s+[^>]*data-type="attachment"[^>]*src="([^"]+)"[^>]*>/g

/**
 * Collects every media reference in an HTML string — both inline images and attachment tags — as
 * `{ originalSrc, filePath, fileName }`, deduped by originalSrc. Single source of truth for the
 * "scan body for media" step shared by read-time signing and the post-create attachment sweeps.
 */
export function extractMediaSrcMatches(htmlString: string): { originalSrc: string; filePath: string; fileName: string }[] {
  const matches: { originalSrc: string; filePath: string; fileName: string }[] = []
  const seen = new Set<string>()
  for (const regex of [imgSrcRegex(), attachmentSrcRegex()]) {
    let match
    while ((match = regex.exec(htmlString)) !== null) {
      const originalSrc = match[1]
      if (seen.has(originalSrc)) continue
      const filePath = getFilePathFromUrl(originalSrc)
      const fileName = filePath?.split('/').pop()
      if (!filePath || !fileName) continue
      seen.add(originalSrc)
      matches.push({ originalSrc, filePath, fileName })
    }
  }
  return matches
}

/**
 * Read-time signing for a task/template body: rewrites every inline image and attachment tag to a
 * freshly signed URL (which resolves to the configured storage domain). Batches all paths into one
 * createSignedUrls call rather than signing one at a time.
 */
export async function replaceMediaSrcs(htmlString: string): Promise<string> {
  const matches = extractMediaSrcMatches(htmlString)
  if (!matches.length) return htmlString

  const signed = await createSignedUrls(matches.map((m) => m.filePath))
  const urlByPath = new Map(signed.filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl as string]))

  let result = htmlString
  for (const { originalSrc, filePath } of matches) {
    const newUrl = urlByPath.get(filePath)
    if (newUrl) result = result.replaceAll(originalSrc, newUrl)
  }
  return result
}

export async function replaceImageSrc(htmlString: string, getSignedUrl: (filePath: string) => Promise<string | undefined>) {
  const imgTagRegex = /<img\s+[^>]*src="([^"]+)"[^>]*>/g //expression used to match all img tags in provided HTML string.
  const replacements: { originalSrc: string; newUrl: string }[] = []
  let match

  // First pass: collect all replacements
  while ((match = imgTagRegex.exec(htmlString)) !== null) {
    const originalSrc = match[1] //matches the content of the first capture of regex, ie string inside the src attribute of the img tag.
    const filePath = getFilePathFromUrl(originalSrc)
    if (filePath) {
      const newUrl = await getSignedUrl(filePath)
      newUrl && replacements.push({ originalSrc, newUrl })
    }
  }

  // Second pass: apply all replacements
  for (const { originalSrc, newUrl } of replacements) {
    htmlString = htmlString.replace(originalSrc, newUrl)
  }

  return htmlString
}

export function getFilePathFromUrl(url: string) {
  try {
    const parsedUrl = new URL(url)
    const pathname = parsedUrl.pathname
    const filePath = pathname.split('/media/')[1]
    return filePath
  } catch (error) {
    console.error('Invalid URL:', error)
    return null
  }
}

export const extractImgSrcs = (body: string) => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(body, 'text/html')
  const imgs = Array.from(doc.querySelectorAll('img'))
  return imgs.map((img) => img.src) // Return an array of srcs
}

export const replaceImgSrcs = (body: string, newSrcs: string[], oldSrcs: string[]) => {
  let updatedBody = body
  newSrcs.forEach((newSrc, index) => {
    const filePath = getFilePathFromUrl(newSrc)
    if (filePath) {
      const match = oldSrcs.find((oldSrc) => oldSrc.includes(filePath))
      if (match) {
        updatedBody = updatedBody.replace(newSrc, match)
      }
    }
  })
  return updatedBody
}

export const signMediaForComments = async (comments: Comment[]) =>
  await Promise.all(
    comments.map(async (comment) => ({
      ...comment,
      content: await rewriteCommentMediaSrcs(comment.content, comment.id),
    })),
  )

// OUT-3763 fallback for ~26 comments whose stored URLs point at a pre-move
// path. Attachment tags are only rewritten when the path lacks the
// comment-scoped segment — downloads use the path, not the token, so healthy
// attachment tags need no work. Remove this once the backfill lands.
async function rewriteCommentMediaSrcs(htmlString: string, commentId: string): Promise<string> {
  // Regexes are created per-call: /g state is mutable and signMediaForComments
  // runs this concurrently via Promise.all — module-level instances would race.
  const imgTagRegex = /<img\s+[^>]*src="([^"]+)"[^>]*>/g
  const attachmentTagRegex = /<\s*[a-zA-Z]+\s+[^>]*data-type="attachment"[^>]*src="([^"]+)"[^>]*>/g
  const replacements: { originalSrc: string; newUrl: string }[] = []
  const seen = new Set<string>()
  let match

  while ((match = imgTagRegex.exec(htmlString)) !== null) {
    const originalSrc = match[1]
    if (seen.has(originalSrc)) continue
    seen.add(originalSrc)
    const filePath = getFilePathFromUrl(originalSrc)
    if (!filePath) continue
    const newUrl = await signCommentMediaPath(filePath, commentId)
    if (newUrl) replacements.push({ originalSrc, newUrl })
  }

  while ((match = attachmentTagRegex.exec(htmlString)) !== null) {
    const originalSrc = match[1]
    if (seen.has(originalSrc)) continue
    const filePath = getFilePathFromUrl(originalSrc)
    if (!filePath) continue
    if (filePath.includes(`/comments/${commentId}/`)) continue
    seen.add(originalSrc)
    const newUrl = await signCommentMediaPath(filePath, commentId)
    if (newUrl) replacements.push({ originalSrc, newUrl })
  }

  for (const { originalSrc, newUrl } of replacements) {
    htmlString = htmlString.replaceAll(originalSrc, newUrl)
  }
  return htmlString
}

async function signCommentMediaPath(filePath: string, commentId: string): Promise<string | undefined> {
  const primary = await getSignedUrl(filePath)
  if (primary) return primary

  const segments = filePath.split('/')
  const fileName = segments.pop()
  const prefix = segments.join('/')
  if (!fileName || !prefix) return undefined

  return await getSignedUrl(`${prefix}/comments/${commentId}/${fileName}`)
}
