import { getSignedUrl } from '@/utils/signUrl'
import { Comment } from '@prisma/client'

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
const IMG_TAG_REGEX = /<img\s+[^>]*src="([^"]+)"[^>]*>/g
const ATTACHMENT_TAG_REGEX = /<\s*[a-zA-Z]+\s+[^>]*data-type="attachment"[^>]*src="([^"]+)"[^>]*>/g

async function rewriteCommentMediaSrcs(htmlString: string, commentId: string): Promise<string> {
  const replacements: { originalSrc: string; newUrl: string }[] = []
  const seen = new Set<string>()
  let match

  IMG_TAG_REGEX.lastIndex = 0
  while ((match = IMG_TAG_REGEX.exec(htmlString)) !== null) {
    const originalSrc = match[1]
    if (seen.has(originalSrc)) continue
    seen.add(originalSrc)
    const filePath = getFilePathFromUrl(originalSrc)
    if (!filePath) continue
    const newUrl = await signCommentMediaPath(filePath, commentId)
    if (newUrl) replacements.push({ originalSrc, newUrl })
  }

  ATTACHMENT_TAG_REGEX.lastIndex = 0
  while ((match = ATTACHMENT_TAG_REGEX.exec(htmlString)) !== null) {
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
    htmlString = htmlString.replace(originalSrc, newUrl)
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
