import { Token, TokenSchema } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { ZodError } from 'zod'

type GetSafeTokenPayloadArgs = {
  token: string
}

const getErrorStatus = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null

  const status = 'status' in error ? error.status : undefined
  if (typeof status === 'number') return status

  const statusCode = 'statusCode' in error ? error.statusCode : undefined
  return typeof statusCode === 'number' ? statusCode : null
}

const isTokenAuthorizationError = (error: unknown): boolean => {
  const status = getErrorStatus(error)
  if (status && [401, 403].includes(status)) return true

  return error instanceof ZodError || (error instanceof Error && error.message.includes('Unable to authorize Copilot SDK'))
}

export async function getSafeTokenPayload({ token }: GetSafeTokenPayloadArgs): Promise<Token | null> {
  try {
    const payload = await new CopilotAPI(token).getTokenPayload()
    const parsedPayload = TokenSchema.safeParse(payload)
    return parsedPayload.success ? parsedPayload.data : null
  } catch (error: unknown) {
    if (isTokenAuthorizationError(error)) return null
    throw error
  }
}
