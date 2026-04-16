import { IdParams } from '@/app/api/core/types/api'
import authenticate from '@/app/api/core/utils/authenticate'
import { PublicTemplateSerializer } from '@/app/api/tasks/templates/public/public.serializer'
import { TemplatesService } from '@/app/api/tasks/templates/templates.service'
import { defaultLimit } from '@/constants/public-api'
import { getSearchParams } from '@/utils/request'
import { encode, decode } from 'js-base64'
import { ValidateUuid } from '@api/core/utils/validateUuid'
import { PublicResource } from '@api/core/types/public'

import { NextRequest, NextResponse } from 'next/server'

export const getTaskTemplatesPublic = async (req: NextRequest) => {
  const user = await authenticate(req)
  const { limit, nextToken } = getSearchParams(req.nextUrl.searchParams, ['limit', 'nextToken'])
  const templateService = new TemplatesService(user)
  const templates = await templateService.getTaskTemplates({
    limit: limit ? +limit : defaultLimit,
    lastIdCursor: nextToken ? decode(nextToken) : undefined,
  })
  const lastTemplateId = templates[templates.length - 1]?.id
  const hasMoreTemplates = lastTemplateId ? await templateService.hasMoreTemplatesAfterCursor(lastTemplateId) : false
  const base64NextToken = hasMoreTemplates ? encode(lastTemplateId) : undefined
  return NextResponse.json({ data: PublicTemplateSerializer.serialize(templates), nextToken: base64NextToken })
}

export const getTaskTemplatePublic = async (req: NextRequest, { params }: IdParams) => {
  const { id } = await params
  ValidateUuid(id, PublicResource.Tasks)
  const user = await authenticate(req)
  const templatesService = new TemplatesService(user)
  const template = await templatesService.getOneTemplate(id)
  return NextResponse.json({ ...PublicTemplateSerializer.serialize(template) })
}
