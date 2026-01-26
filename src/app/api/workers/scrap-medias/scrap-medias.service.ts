import { subWeeks, isBefore, subMinutes } from 'date-fns'
import { SupabaseService } from '@/app/api/core/services/supabase.service'
import { supabaseBucket, ScrapImageExpiryPeriod } from '@/config'
import { PrismaClient, ScrapMedia } from '@prisma/client'
import DBClient from '@/lib/db'
import APIError from '@/app/api/core/exceptions/api'
import { z } from 'zod'

export class ScrapMediaService {
  async removeScrapMedias() {
    const expiryPeriod = new Date(Date.now() - z.number().parse(ScrapImageExpiryPeriod))

    const db: PrismaClient = DBClient.getInstance()
    const scrapMedias = await db.scrapMedia.findMany({
      where: {
        updatedAt: {
          lt: expiryPeriod,
        },
      },
      // Putting a buffer of 0.5s for each deletion (which should be more than very enough), we take 600 records at a time
      // for each worker
      take: 600,
    })
    const supabase = new SupabaseService()

    const taskIds = scrapMedias.map((image) => image.taskId).filter((taskId): taskId is string => taskId !== null)

    const templateIds = scrapMedias
      .map((image) => image.templateId)
      .filter((templateId): templateId is string => templateId !== null)

    const commentIds = scrapMedias
      .map((medias) => medias.commentId)
      .filter((commentId): commentId is string => commentId !== null)

    const tasks = taskIds.length
      ? await db.task.findMany({
          where: {
            id: { in: taskIds },
          },
        })
      : []

    const taskTemplates =
      templateIds.length > 0
        ? await db.taskTemplate.findMany({
            where: {
              id: { in: templateIds },
            },
          })
        : []

    const comments =
      commentIds.length > 0
        ? await db.comment.findMany({
            where: {
              id: { in: commentIds },
            },
          })
        : []

    const scrapMediasToDelete = []
    const scrapMediasToDeleteFromBucket = []

    for (const media of scrapMedias) {
      try {
        // For each scrap image, check if the task or taskTemplate still has the img url in its body
        const task = tasks.find((_task) => _task.id === media.taskId)
        const taskTemplate = taskTemplates.find((_template) => _template.id === media.templateId)
        const comment = comments.find((_comment) => _comment.id === media.commentId)

        const isInTaskBody = task && (task.body || '').includes(media.filePath)
        const isInTemplateBody = taskTemplate && (taskTemplate.body || '').includes(media.filePath)
        const isInCommentBody = comment && (comment.content || '').includes(media.filePath)

        if (!task && !taskTemplate && !comment) {
          console.error('Could not find location of scrap media', media)
          scrapMediasToDelete.push(media.id)
          scrapMediasToDeleteFromBucket.push(media.filePath)
          continue
        }
        // If media is valid
        if (isInTaskBody || isInTemplateBody || isInCommentBody) {
          scrapMediasToDelete.push(media.id)
          continue
        }
        // If media is not valid

        scrapMediasToDeleteFromBucket.push(media.filePath)
        scrapMediasToDelete.push(media.id)
      } catch (e: unknown) {
        console.error('Error processing scrap media', e)
      }
    }

    if (!!scrapMediasToDeleteFromBucket.length)
      await db.attachment.deleteMany({ where: { filePath: { in: scrapMediasToDeleteFromBucket } } })

    // remove attachments from bucket
    await supabase.removeAttachmentsFromBucket(scrapMediasToDeleteFromBucket)

    if (scrapMediasToDelete.length !== 0) {
      const idsToDelete = scrapMediasToDelete.map((id) => `'${id}'`).join(', ')
      await db.$executeRawUnsafe(`
        DELETE FROM "ScrapMedias"
        WHERE "id" IN (${idsToDelete})
      `)
    }
  }
}
