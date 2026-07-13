import { CreateTemplateRequest, UpdateTemplateRequest } from '@/types/dto/templates.dto'
import { copyTemplateMediaToTask } from '@/utils/signedTemplateUrlReplacer'
import { extractMediaSrcMatches, replaceImageSrc } from '@/utils/signedUrlReplacer'
import { getSignedUrl } from '@/utils/signUrl'
import { sanitize } from '@/utils/sql'
import { SupabaseActions } from '@/utils/SupabaseActions'
import APIError from '@api/core/exceptions/api'
import { BaseService } from '@api/core/services/base.service'
import { PoliciesService } from '@api/core/services/policies.service'
import { Resource } from '@api/core/types/api'
import { UserAction } from '@api/core/types/user'
import { Prisma } from '@prisma/client'
import httpStatus from 'http-status'
import { z } from 'zod'

export class TemplatesService extends BaseService {
  async getTaskTemplates(queryFilters?: { fromPublicApi?: boolean; limit?: number; lastIdCursor?: string }) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Read, Resource.TaskTemplates)

    const findOptions: Prisma.TaskTemplateFindManyArgs = {
      where: { workspaceId: this.user.workspaceId, parentId: null },
      relationLoadStrategy: 'join',
      include: {
        workflowState: true,
        subTaskTemplates: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: queryFilters?.fromPublicApi ? { createdAt: 'desc' } : { updatedAt: 'desc' },
    }

    if (queryFilters?.limit) {
      findOptions.take = queryFilters.limit
    }

    if (queryFilters?.lastIdCursor) {
      findOptions.cursor = { id: queryFilters.lastIdCursor }
      findOptions.skip = 1
    }

    const templates = await this.db.taskTemplate.findMany(findOptions)

    const updatedTemplates = await Promise.all(
      templates.map(async (template) => ({
        ...template,
        body: template.body ? await replaceImageSrc(template.body, getSignedUrl) : null,
      })),
    )

    return updatedTemplates
  }

  async getAppliedTemplateDescription(id: string) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Read, Resource.TaskTemplates)

    const template = await this.db.taskTemplate.findFirst({
      where: { workspaceId: this.user.workspaceId, id },
    })
    if (!template) {
      throw new APIError(httpStatus.NOT_FOUND, 'Could not find template to apply')
    }
    let replacedBody
    if (template.body) {
      replacedBody = await copyTemplateMediaToTask(this.user.workspaceId, template.body)
      replacedBody = replacedBody && (await replaceImageSrc(replacedBody, getSignedUrl))
    }
    return { ...template, body: replacedBody || template.body }
  }

  async getOneTemplate(id: string) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Read, Resource.TaskTemplates)

    const template = await this.db.taskTemplate.findFirst({
      where: { workspaceId: this.user.workspaceId, id },
    })

    if (!template) {
      throw new APIError(httpStatus.NOT_FOUND, 'Could not find template')
    }
    const updatedTemplate = await this.db.taskTemplate.update({
      where: { id: template.id },
      data: {
        body: template.body && (await replaceImageSrc(template.body, getSignedUrl)),
      },
      relationLoadStrategy: 'join',
      include: {
        workflowState: true,

        subTaskTemplates: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
        parent: true, //remove this for public api
      },
    })

    return updatedTemplate
  }

  async getSubtemplates(id: string) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Read, Resource.TaskTemplates)
    const template = await this.db.taskTemplate.findMany({
      where: { workspaceId: this.user.workspaceId, parentId: id },
      include: {
        subTaskTemplates: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })
    return template
  }

  async createTaskTemplate(payload: CreateTemplateRequest, parentId?: string) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Create, Resource.TaskTemplates)

    // If template with same title already exists, append successive "copy" string after it
    // E.g. "hello" -> "hello copy" -> "hello copy copy"
    let title = sanitize(payload.title.trim())
    // For some reason normal parameterized string doesn't work so using Prisma.raw with sanitized strings
    const query = Prisma.sql`
      SELECT COUNT(*) AS count
      FROM "TaskTemplates"
      WHERE "title" ~ '^${Prisma.raw(`${title}`)}( copy)*$'
        AND "workspaceId" = '${Prisma.raw(`${this.user.workspaceId}`)}'
        AND "deletedAt" IS NULL;
    `
    const result = await this.db.$queryRaw<{ count: bigint }[]>`${query}`

    const count = result[0]?.count

    if (!parentId) {
      for (let i = 0; i < count; i++) {
        title += ' copy'
      }
    } //ignore adding "copy" on sub task templates

    let templates = await this.db.taskTemplate.create({
      data: {
        ...payload,
        title,
        workspaceId: this.user.workspaceId,
        createdById: z.string().parse(this.user.internalUserId),
        parentId: parentId,
      },
    })
    if (templates.body) {
      const newBody = await this.updateTaskIdOfAttachmentsAfterCreation(templates.body, templates.id)
      await this.db.taskTemplate.update({
        where: { id: templates.id },
        data: {
          body: newBody,
        },
      })
    } //updating storage path, url of attachments after template creation
    return templates
  }

  async updateTaskTemplate(id: string, payload: UpdateTemplateRequest) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Update, Resource.TaskTemplates)

    const template = await this.db.taskTemplate.update({
      where: { id, workspaceId: this.user.workspaceId },
      data: payload,
    })
    return template
  }

  async createSubTaskTemplate(id: string, payload: CreateTemplateRequest) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Update, Resource.TaskTemplates)

    const existingTemplate = await this.db.taskTemplate.findUnique({
      where: { id, workspaceId: this.user.workspaceId },
    })

    if (!existingTemplate) {
      throw new APIError(httpStatus.NOT_FOUND, 'Could not find template')
    }

    if (existingTemplate.parentId) {
      throw new APIError(httpStatus.BAD_REQUEST, 'Child templates cannot have sub task templates')
    }
    const subTaskTemplate = await this.createTaskTemplate(payload, id)
    return subTaskTemplate
  }

  async deleteTaskTemplate(id: string) {
    const policyGate = new PoliciesService(this.user)
    policyGate.authorize(UserAction.Delete, Resource.TaskTemplates)

    let template = await this.db.taskTemplate.delete({
      where: { id, workspaceId: this.user.workspaceId },
    })
    return template
  }

  private async updateTaskIdOfAttachmentsAfterCreation(htmlString: string, template_id: string) {
    const replacements: { originalSrc: string; newUrl: string }[] = []

    const newFilePaths: { originalSrc: string; newFilePath: string }[] = []
    const copyAttachmentPromises: Promise<void>[] = []
    const matches = extractMediaSrcMatches(htmlString)

    for (const { originalSrc, filePath, fileName } of matches) {
      const newFilePath = `${this.user.workspaceId}/templates/${template_id}/${fileName}`
      const supabaseActions = new SupabaseActions()
      copyAttachmentPromises.push(supabaseActions.moveAttachment(filePath, newFilePath))
      newFilePaths.push({ originalSrc, newFilePath })
    }

    await Promise.all(copyAttachmentPromises)

    const signedUrlPromises = newFilePaths.map(async ({ originalSrc, newFilePath }) => {
      const newUrl = await getSignedUrl(newFilePath)
      if (newUrl) {
        replacements.push({ originalSrc, newUrl })
      }
    })

    await Promise.all(signedUrlPromises)

    for (const { originalSrc, newUrl } of replacements) {
      htmlString = htmlString.replace(originalSrc, newUrl)
    }
    const filePaths = newFilePaths.map(({ newFilePath }) => newFilePath)
    await this.db.scrapMedia.updateMany({
      where: {
        filePath: {
          in: filePaths,
        },
      },
      data: {
        taskId: template_id,
      },
    })
    return htmlString
  }

  async hasMoreTemplatesAfterCursor(id: string): Promise<boolean> {
    const nextTemplate = await this.db.taskTemplate.findFirst({
      where: { workspaceId: this.user.workspaceId },
      cursor: { id },
      orderBy: { createdAt: 'desc' },
      skip: 1,
    })
    return !!nextTemplate
  }
}
