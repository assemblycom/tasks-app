import { Token, TokenSchema } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { normalizeTokenParam } from '@/utils/tokenQuery'

export async function getEmbedTokenPayload(token: string | null | undefined): Promise<Token | null> {
  const normalizedToken = normalizeTokenParam(token)
  if (!normalizedToken) return null

  try {
    const copilotClient = new CopilotAPI(normalizedToken)
    return TokenSchema.parse(await copilotClient.getTokenPayload())
  } catch {
    return null
  }
}
