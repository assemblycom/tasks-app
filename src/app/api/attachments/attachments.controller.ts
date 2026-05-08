import { NextRequest, NextResponse } from 'next/server'
import authenticate from '@api/core/utils/authenticate'
import {
  CreateAttachmentRequest,
  CreateAttachmentRequestSchema,
  CustomUploadBodySchema,
  CustomUploadPayloadSchema,
} from '@/types/dto/attachments.dto'
import { AttachmentsService } from '@api/attachments/attachments.service'
import httpStatus from 'http-status'
import { IdParams } from '@api/core/types/api'
import APIError from '@/app/api/core/exceptions/api'

export const createAttachment = async (req: NextRequest) => {
  const user = await authenticate(req)
  const body = CreateAttachmentRequestSchema.parse(await req.json())
  const attachmentsService = new AttachmentsService(user)
  const newAttachment = await attachmentsService.createAttachments(body)
  return NextResponse.json({ newAttachment }, { status: httpStatus.CREATED })
}

export const createMultipleAttachments = async (req: NextRequest) => {
  const user = await authenticate(req)
  const body = await req.json()
  const attachmentsService = new AttachmentsService(user)
  const newAttachments = await attachmentsService.createMultipleAttachments(body)
  return NextResponse.json({ newAttachments }, { status: httpStatus.CREATED })
}

export const getAttachments = async (req: NextRequest) => {
  const taskId = req.nextUrl.searchParams.get('taskId')
  if (!taskId) {
    throw new APIError(httpStatus.BAD_REQUEST, 'taskId is required')
  }
  const user = await authenticate(req)
  const attachmentsService = new AttachmentsService(user)
  const attachments = await attachmentsService.getAttachments(taskId)
  return NextResponse.json({ attachments })
}

export const deleteAttachment = async (req: NextRequest, { params }: IdParams) => {
  const { id } = await params
  const user = await authenticate(req)
  const attachmentsService = new AttachmentsService(user)
  await attachmentsService.deleteAttachment(id)
  return new NextResponse(null, { status: httpStatus.NO_CONTENT })
}

export const getSignedUrlUpload = async (req: NextRequest) => {
  const fileName = req.nextUrl.searchParams.get('fileName')
  if (!fileName) throw new APIError(httpStatus.BAD_REQUEST, 'fileName is required')

  const filePath = req.nextUrl.searchParams.get('filePath')
  if (!filePath) throw new APIError(httpStatus.BAD_REQUEST, 'filePath is required')

  const user = await authenticate(req)
  const attachmentsService = new AttachmentsService(user)
  const signedUrl = await attachmentsService.signUrlUpload(fileName, filePath)
  return NextResponse.json({ signedUrl })
}

export const getSignedUrlFile = async (req: NextRequest) => {
  const filePath = req.nextUrl.searchParams.get('filePath')
  if (!filePath) {
    throw new APIError(httpStatus.BAD_REQUEST, 'filePath is required')
  }
  const user = await authenticate(req)
  const attachmentsService = new AttachmentsService(user)
  const signedUrl = await attachmentsService.getSignedUrl(filePath)
  return NextResponse.json({ signedUrl })
}
