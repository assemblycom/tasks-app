import { NextRequest, NextResponse } from 'next/server'
import httpStatus from 'http-status'
import authenticate from '@api/core/utils/authenticate'
import APIError from '@/app/api/core/exceptions/api'
import { PublicAttachmentsService } from '@api/attachments/public/public.service'
import { PublicAttachmentDtoSchema } from '@/app/api/attachments/public/public.dto'
import { RFC3339DateSchema } from '@/types/common'
import { toRFC3339 } from '@/utils/dateHelper'
import { sanitizeFileName } from '@/utils/sanitizeFileName'
import { getSignedUrl } from '@/utils/signUrl'
import { MAX_UPLOAD_LIMIT } from '@/constants/attachments'
import { AssigneeType } from '@prisma/client'

const MULTIPART_FILE_FIELD = 'file'

export const createAttachmentPublic = async (req: NextRequest) => {
  const user = await authenticate(req)

  const multipartFormData = await req.formData().catch(() => {
    throw new APIError(httpStatus.BAD_REQUEST, 'Request must be multipart/form-data')
  })
  const uploadedFile = multipartFormData.get(MULTIPART_FILE_FIELD)
  if (!(uploadedFile instanceof File)) {
    throw new APIError(httpStatus.BAD_REQUEST, `Missing "${MULTIPART_FILE_FIELD}" field in multipart payload`)
  }
  if (uploadedFile.size > MAX_UPLOAD_LIMIT) {
    throw new APIError(httpStatus.REQUEST_ENTITY_TOO_LARGE, `File exceeds maximum upload size of ${MAX_UPLOAD_LIMIT} bytes`)
  }

  const publicAttachmentsService = new PublicAttachmentsService(user)
  const newOrphanAttachment = await publicAttachmentsService.uploadOrphanAttachment(uploadedFile)

  const downloadUrl = await getSignedUrl(newOrphanAttachment.filePath)

  const responseBody = PublicAttachmentDtoSchema.parse({
    id: newOrphanAttachment.id,
    fileName: sanitizeFileName(newOrphanAttachment.fileName),
    fileSize: newOrphanAttachment.fileSize,
    mimeType: newOrphanAttachment.fileType,
    downloadUrl: downloadUrl ?? null,
    uploadedBy: newOrphanAttachment.createdById,
    uploadedByUserType: AssigneeType.internalUser,
    uploadedDate: RFC3339DateSchema.parse(toRFC3339(newOrphanAttachment.createdAt)),
  })

  return NextResponse.json(responseBody, { status: httpStatus.CREATED })
}
