import { withErrorHandler } from '@/app/api/core/utils/withErrorHandler'
import { removeScrapMedias } from '@/app/api/workers/scrap-medias/scrap-medias.controller'

export const maxDuration = 300

export const GET = withErrorHandler(removeScrapMedias)
