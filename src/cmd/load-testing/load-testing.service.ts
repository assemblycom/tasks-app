import { authenticateWithToken } from '@/app/api/core/utils/authenticate'
import { LabelMappingService } from '@/app/api/label-mapping/label-mapping.service'
import DBClient from '@/lib/db'
import {
  ClientRequest,
  ClientRequestSchema,
  ClientResponse,
  CompanyCreateRequest,
  CompanyCreateRequestSchema,
} from '@/types/common'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { getRandomBool, getRandomFutureDate, getRandomFutureDateTime } from '@/utils/random'
import { faker } from '@faker-js/faker'
import { AssigneeType, PrismaClient, Source, Task } from '@prisma/client'
import Bottleneck from 'bottleneck'
import { z } from 'zod'

// When running with tsx, we need to call dotenv.configure() again, since we aren't running it as a next script directly
import dotenv from 'dotenv'
dotenv.config()

export interface Taskable {
  id: string
}

export type TaskableAssigneeType = 'client' | 'company'

class LoadTester {
  protected db: PrismaClient = DBClient.getInstance()

  private token = z.string().parse(process.env.LOAD_TESTING_COPILOT_TOKEN)
  private apiKey = z.string().parse(process.env.COPILOT_API_KEY)
  private copilot: CopilotAPI = new CopilotAPI(this.token, this.apiKey)

  // API bottleneck specific to seeding Copilot API
  // Ref: https://www.npmjs.com/package/bottleneck
  private bottlenecks = {
    copilot: new Bottleneck({ minTime: 150, maxConcurrent: 2 }),
    db: new Bottleneck({ minTime: 100, maxConcurrent: 5 }),
  }

  /**
   * Client seeding
   */
  async seedClients(numOfClients: number, companyId?: string): Promise<ClientResponse[]> {
    if (companyId && z.string().uuid().safeParse(companyId).error) {
      console.error('LoadTester#seedClients :: Invalid companyId', companyId)
    }
    const seedPromises = []
    for (let i = 0; i < numOfClients; i++) {
      const givenName = faker.person.firstName()
      const familyName = faker.person.lastName()
      const email = 'loadtest_' + faker.internet.email().toLowerCase()
      const client: ClientRequest = ClientRequestSchema.parse({ givenName, familyName, email, companyId })
      const seedPromiseWithBottleneck = this.bottlenecks.copilot.schedule(() => {
        console.info(`Seeding client ${givenName} ${familyName}`, companyId ? `for companyId ${companyId}` : '(individual)')
        return this.copilot.createClient(client)
      })
      seedPromises.push(seedPromiseWithBottleneck)
    }
    return await Promise.all(seedPromises)
  }

  async seedCompanyClients(numOfCompanies: number, numOfClients: number) {
    const seedPromises = []
    for (let i = 0; i < numOfCompanies; i++) {
      const name = faker.company.name() + ' Loadtest'
      const company: CompanyCreateRequest = CompanyCreateRequestSchema.parse({ name })
      const seedPromiseWithBottleneck = this.bottlenecks.copilot.schedule(() => {
        console.info(`Seeding company ${name}`)
        return this.copilot.createCompany(company)
      })
      seedPromises.push(seedPromiseWithBottleneck)
    }
    const clients: ClientResponse[] = []

    const companies = await Promise.all(seedPromises)
    for (let company of companies) {
      const companyClients = await this.seedClients(numOfClients, company.id)
      clients.push(...companyClients)
    }

    return { companies, clients }
  }

  /**
   * Tasks seeding
   */
  private async seedTasks(users: Taskable[], assigneeType: TaskableAssigneeType, taskPerUser: number) {
    const seedPromises = []
    for (let user of users) {
      const data: Omit<
        Task,
        | 'id'
        | 'completedAt'
        | 'deletedAt'
        | 'lastActivityLogUpdated'
        | 'isArchived'
        | 'lastArchivedDate'
        | 'parentId'
        | 'subtaskCount'
        | 'templateId'
        | 'completedBy'
        | 'completedByUserType'
        | 'archivedBy'
        | 'deletedBy'
        | 'internalUserId'
        | 'clientId'
        | 'companyId'
        | 'lastSubtaskUpdated'
        | 'associations'
        | 'isShared'
      >[] = []
      const currentUser = await authenticateWithToken(this.token, this.apiKey)
      const labelsService = new LabelMappingService(currentUser, this.apiKey)
      const workflowStates = await this.db.workflowState.findMany({
        where: {
          type: { not: 'completed' },
          workspaceId: currentUser.workspaceId,
        },
        select: { id: true, type: true },
      })

      for (let i = 0; i < taskPerUser; i++) {
        const title = faker.music.songName()
        console.info(`Seeding task "${title}" for ${assigneeType} with ID ${user.id}`)
        data.push({
          title,
          body: faker.lorem.paragraph({ min: 1, max: 10 }),
          createdById: z.string().parse(currentUser.internalUserId),
          workflowStateId: workflowStates[Math.floor(Math.random() * workflowStates.length)].id,
          workspaceId: currentUser.workspaceId,
          label: z.string().parse(
            await labelsService.getLabel({
              internalUserId: null,
              clientId: null,
              companyId: null,
            }),
          ), //passed a static value of userIds null for label. label wont work properly. This load testing service needs to be revamped in the future if we need this to run properly.
          assigneeId: user.id,
          assigneeType,
          assignedAt: getRandomBool() ? getRandomFutureDate() : null,
          createdAt: new Date(),
          dueDate: getRandomBool() ? getRandomFutureDateTime() : null,
          source: Source.web,
        })
      }
      seedPromises.push(this.bottlenecks.db.schedule(() => this.db.task.createMany({ data })))
    }
    return await Promise.all(seedPromises)
  }

  private seedTasksFactory = (assigneeType: TaskableAssigneeType) => async (users: Taskable[], num: number) =>
    await this.seedTasks(users, assigneeType, num)

  seedClientTasks = this.seedTasksFactory(AssigneeType.client)
  seedCompanyTasks = this.seedTasksFactory(AssigneeType.company)
}

export default LoadTester
