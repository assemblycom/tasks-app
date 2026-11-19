import { AssemblySource } from '@/constants/assemblySource'
import DBClient from '@/lib/db'
import { CopilotAPI } from '@/utils/CopilotAPI'
import User from '@api/core/models/User.model'
import { PrismaClient } from '@prisma/client'

/**
 * Base Service with access to db and current user
 */
export class BaseService {
  protected db: PrismaClient = DBClient.getInstance()
  public readonly user: User
  public readonly customApiKey?: string
  protected readonly copilot: CopilotAPI

  constructor(user: User, customCopilotApiKey?: string) {
    this.user = user
    this.customApiKey = customCopilotApiKey
    this.copilot = new CopilotAPI(user.token)
  }

  setTransaction(tx: PrismaClient) {
    this.db = tx
  }

  unsetTransaction() {
    this.db = DBClient.getInstance()
  }

  // An automation acts as the IU who saved it, so the acting user is a proxy for someone who is not present.
  protected get isAutomationActor(): boolean {
    return this.user.assemblyMetadata?.source === AssemblySource.automation
  }
}
