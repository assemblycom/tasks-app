import { getSignedUrl } from '@/utils/signUrl'
import { Comment } from '@prisma/client'

const imgTagRegex = /<img\s+[^>]*src="([^"]+)"[^>]*>/g
const attachmentTagRegex = /<\s*[a-zA-Z]+\s+[^>]*data-type="attachment"[^>]*src="([^"]+)"[^>]*>/g

export async function replaceImageSrc(htmlString: string, getSignedUrl: (filePath: string) => Promise<string | undefined>) {
  const replacements: { originalSrc: string; newUrl: string }[] = []
  const seen = new Set<string>()
  let match

  for (const regex of [imgTagRegex, attachmentTagRegex]) {
    regex.lastIndex = 0
    while ((match = regex.exec(htmlString)) !== null) {
      const originalSrc = match[1]
      if (seen.has(originalSrc)) continue
      seen.add(originalSrc)
      const filePath = getFilePathFromUrl(originalSrc)
      if (filePath) {
        const newUrl = await getSignedUrl(filePath)
        newUrl && replacements.push({ originalSrc, newUrl })
      }
    }
  }

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
    comments.map(async (comment) => {
      return {
        ...comment,
        content: await replaceImageSrc(comment.content, getSignedUrl),
      }
    }),
  )
