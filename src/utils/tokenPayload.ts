import { Token, TokenSchema } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'

export async function getSafeTokenPayload(token: string): Promise<Token | null> {
  try {
    const copilotClient = new CopilotAPI(token)
    const payload = TokenSchema.safeParse(await copilotClient.getTokenPayload())

    if (!payload.success) {
      return null
    }

    return payload.data
  } catch {
    return null
  }
}
