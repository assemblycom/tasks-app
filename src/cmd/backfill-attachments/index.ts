import DBClient from '@/lib/db'
import { CreateAttachmentRequestSchema } from '@/types/dto/attachments.dto'
import { getFilePathFromUrl } from '@/utils/signedUrlReplacer'
import { SupabaseActions } from '@/utils/SupabaseActions'
import { Task, Comment } from '@prisma/client'

const ATTACHMENT_TAG_REGEX = /<\s*[a-zA-Z]+\s+[^>]*data-type="attachment"[^>]*src="([^"]+)"[^>]*>/g
const IMG_TAG_REGEX = /<img\s+[^>]*src="([^"]+)"[^>]*>/g

interface AttachmentRequest {
  createdById: string
  workspaceId: string
  attachmentRequest: ReturnType<typeof CreateAttachmentRequestSchema.parse>
}

interface ProcessedAttachments {
  taskAttachmentRequests: AttachmentRequest[]
  commentAttachmentRequests: AttachmentRequest[]
  filesNotFoundInBucket: string[]
}

async function extractAttachmentsFromContent(
  content: string,
  supabaseActions: SupabaseActions,
  filesNotFound: string[],
): Promise<Array<{ filePath: string; fileSize?: number; fileType?: string; fileName?: string }>> {
  const attachments: Array<{ filePath: string; fileSize?: number; fileType?: string; fileName?: string }> = []
  const regexes = [IMG_TAG_REGEX, ATTACHMENT_TAG_REGEX]

  for (const regex of regexes) {
    let match
    regex.lastIndex = 0
    while ((match = regex.exec(content)) !== null) {
      const originalSrc = match[1]
      const filePath = getFilePathFromUrl(originalSrc)
      if (!filePath) continue
      const fileMetaData = await supabaseActions.getMetaData(filePath)
      if (!fileMetaData) {
        filesNotFound.push(filePath)
        continue
      }
      const fileName = filePath.split('/').pop()
      attachments.push({
        filePath,
        fileSize: fileMetaData.size,
        fileType: fileMetaData.contentType,
        fileName,
      })
    }
  }
  return attachments
}

async function createAttachmentRequests(tasks: Task[], comments: Comment[]): Promise<ProcessedAttachments> {
  const taskAttachmentRequests: AttachmentRequest[] = []
  const commentAttachmentRequests: AttachmentRequest[] = []
  const filesNotFoundInBucket: string[] = []
  const supabaseActions = new SupabaseActions()

  for (const task of tasks) {
    const bodyString = task.body ?? ''
    const attachments = await extractAttachmentsFromContent(bodyString, supabaseActions, filesNotFoundInBucket)
    for (const attachment of attachments) {
      taskAttachmentRequests.push({
        createdById: task.createdById,
        workspaceId: task.workspaceId,
        attachmentRequest: CreateAttachmentRequestSchema.parse({
          taskId: task.id,
          ...attachment,
        }),
      })
    }
  }

  for (const comment of comments) {
    const contentString = comment.content ?? ''
    const attachments = await extractAttachmentsFromContent(contentString, supabaseActions, filesNotFoundInBucket)
    for (const attachment of attachments) {
      commentAttachmentRequests.push({
        createdById: comment.initiatorId,
        workspaceId: comment.workspaceId,
        attachmentRequest: CreateAttachmentRequestSchema.parse({
          commentId: comment.id,
          ...attachment,
        }),
      })
    }
  }

  if (taskAttachmentRequests.length) {
    console.info('🔥 Task attachments to be populated:', taskAttachmentRequests.length)
  }
  if (commentAttachmentRequests.length) {
    console.info('🔥 Comment attachments to be populated:', commentAttachmentRequests.length)
  }
  if (filesNotFoundInBucket.length) {
    console.warn('⚠️  Files not found in bucket:', filesNotFoundInBucket)
  }

  return { taskAttachmentRequests, commentAttachmentRequests, filesNotFoundInBucket }
}

async function createAttachmentsInDatabase(
  db: ReturnType<typeof DBClient.getInstance>,
  attachmentRequests: AttachmentRequest[],
) {
  let created = 0
  let skipped = 0

  for (const { createdById, workspaceId, attachmentRequest } of attachmentRequests) {
    try {
      const existing = await db.attachment.findFirst({
        where: { filePath: attachmentRequest.filePath },
      })
      if (existing) {
        skipped++
        continue
      }
      await db.attachment.create({
        data: {
          ...attachmentRequest,
          createdById,
          workspaceId,
        },
      })
      created++
    } catch (error) {
      console.error('❌ Failed to create attachment:', attachmentRequest, error)
    }
  }

  console.info(`📊 Created: ${created}, Skipped (already exists): ${skipped}`)
}

async function run() {
  console.info('🧑🏻‍💻 Backfilling attachment entries for tasks and comments')

  const db = DBClient.getInstance()
  const [tasks, comments] = await Promise.all([db.task.findMany(), db.comment.findMany()])

  const { taskAttachmentRequests, commentAttachmentRequests } = await createAttachmentRequests(tasks, comments)

  await createAttachmentsInDatabase(db, [...taskAttachmentRequests, ...commentAttachmentRequests])

  console.info('✅ Backfill complete')
}

run()
