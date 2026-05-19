import { TokenSchema, type Token } from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'

export async function getSafeTokenPayload(token: string): Promise<Token | null> {
  try {
    const copilotClient = new CopilotAPI(token)
    const payload = await copilotClient.getTokenPayload()
    const parsedPayload = TokenSchema.safeParse(payload)

    if (!parsedPayload.success) {
      return null
    }

    return parsedPayload.data
  } catch (error) {
    console.info('getSafeTokenPayload | Failed to parse Copilot token payload', error)
    return null
  }
}
