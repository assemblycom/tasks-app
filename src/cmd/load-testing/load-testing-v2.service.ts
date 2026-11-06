import { MAX_FETCH_ASSIGNEE_COUNT } from '@/constants/users'
import DBClient from '@/lib/db'
import {
  ClientRequest,
  ClientRequestSchema,
  ClientResponse,
  ClientResponseSchema,
  CompanyCreateRequest,
  CompanyCreateRequestSchema,
  Token,
  TokenSchema,
} from '@/types/common'
import { CreateTaskRequest, CreateTaskRequestSchema } from '@/types/dto/tasks.dto'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { CopilotAPI } from '@/utils/CopilotAPI'
import { faker } from '@faker-js/faker'
import { AssigneeType, PrismaClient } from '@prisma/client'
import Bottleneck from 'bottleneck'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'

class LoadTester {
  protected db: PrismaClient = DBClient.getInstance()
  private apiUrl = 'https://tasks-app-git-feature-m16-copilot-platforms.vercel.app'
  private token = z.string().parse(process.env.LOAD_TESTING_COPILOT_TOKEN)
  private apiKey = z.string().parse(process.env.COPILOT_API_KEY)
  private copilot: CopilotAPI = new CopilotAPI(this.token, this.apiKey)
  private bottlenecks = {
    copilot: new Bottleneck({ minTime: 250, maxConcurrent: 4 }),
    db: new Bottleneck({ minTime: 100, maxConcurrent: 10 }),
  }

  async seedCompanies(numOfCompanies: number) {
    const seedPromises = []

    for (let i = 0; i < numOfCompanies; i++) {
      const name = faker.company.name() + 'LoadTest'
      const iconImageUrl = faker.image.avatar()
      const isPlaceholder = false

      const company: CompanyCreateRequest = CompanyCreateRequestSchema.parse({ name, iconImageUrl, isPlaceholder })
      const seedPromiseWithBottleneck = this.bottlenecks.copilot.schedule(() => {
        console.info(`Seeding company ${name}`)
        return this.copilot.createCompany(company)
      })
      seedPromises.push(seedPromiseWithBottleneck)
    }
    const responses = await Promise.all(seedPromises)
    this.exportToCSV(responses, AssigneeType.company)
    return responses
  }

  async seedClients(numOfClients: number, includeCompany: boolean = false) {
    const seedPromises = []
    let companiesList = null
    if (includeCompany) {
      companiesList = (await this.copilot.getCompanies({ limit: MAX_FETCH_ASSIGNEE_COUNT })).data?.filter(
        (data) => !data.isPlaceholder,
      )
    }

    for (let i = 0; i < numOfClients; i++) {
      const givenName = faker.person.firstName()
      const familyName = faker.person.lastName() + ' Client'
      const email = faker.internet.email({ firstName: givenName, lastName: familyName })
      let companyId = undefined
      if (includeCompany && companiesList) {
        companyId = companiesList[Math.floor(Math.random() * companiesList.length)].id
      }
      const client: ClientRequest = ClientRequestSchema.parse({ givenName, familyName, email, companyId })
      const seedPromiseWithBottleneck = this.bottlenecks.copilot.schedule(() => {
        console.info(`Seeding client ${givenName} ${familyName}`)
        return this.copilot.createClient(client)
      })
      seedPromises.push(seedPromiseWithBottleneck)
    }
    const responses = await Promise.all(seedPromises)
    this.exportToCSV(responses, AssigneeType.client)
    return responses
  }

  private async getAssigneeList(userType: AssigneeType) {
    if (userType == AssigneeType.client) {
      return (await this.copilot.getClients({ limit: MAX_FETCH_ASSIGNEE_COUNT })).data
    } else if (userType == AssigneeType.company) {
      return (await this.copilot.getCompanies({ limit: MAX_FETCH_ASSIGNEE_COUNT })).data?.filter(
        (data) => !data.isPlaceholder,
      )
    } else if (userType == AssigneeType.internalUser) {
      return (await this.copilot.getInternalUsers({ limit: MAX_FETCH_ASSIGNEE_COUNT })).data
    }
  }

  async seedSubtasks() {
    // Get a fixed number of random parent tasks
    const TASKS_TO_SEED = 400
    const MIN_SUBTASKS_PER_TASK = 1
    const MAX_SUBTASKS_PER_TASK = 60
    const parentTaskCount = await this.db.task.count({ where: { parentId: null } })
    const skip = Math.floor(Math.random() * parentTaskCount)
    const sampleTasks = await this.db.task.findMany({
      where: { parentId: null },
      take: TASKS_TO_SEED,
      skip,
    })

    // Get a list of all users + workflow states + token payload
    const [internalUsers, clients, companies, workflowStates, tokenPayload] = await Promise.all([
      this.getAssigneeList('internalUser'),
      this.getAssigneeList('client'),
      this.getAssigneeList('company'),
      this.getAllWorkflowStates(this.token),
      this.getTokenPayload(this.token),
    ])

    const seedPromises = []

    // For each task in sample tasks, create a random number of subtasks between MIN_SUBTASKS_PER_TASK and MAX_SUBTASKS_PER_TASK
    for (const task of sampleTasks) {
      const subtaskCount =
        Math.floor(Math.random() * (MAX_SUBTASKS_PER_TASK - MIN_SUBTASKS_PER_TASK + 1)) + MIN_SUBTASKS_PER_TASK
      for (let i = 0; i < subtaskCount; i++) {
        const rand = Math.random() * 100
        let assignee = null
        let assigneeType: AssigneeType | null = null
        // 20% chance of internal user, 40% chance of client, 40% chance of company
        if (rand < 20) {
          assignee = internalUsers?.[Math.floor(Math.random() * internalUsers.length)]
          assigneeType = AssigneeType.internalUser
        } else if (rand < 60) {
          assignee = clients?.[Math.floor(Math.random() * clients.length)]
          assigneeType = AssigneeType.client
        } else {
          assignee = companies?.[Math.floor(Math.random() * companies.length)]
          assigneeType = AssigneeType.company
        }

        const subtask = CreateTaskRequestSchema.parse({
          title: faker.hacker.phrase(),
          body: faker.lorem.paragraph(),
          workflowStateId: workflowStates[Math.floor(Math.random() * workflowStates.length)].id,
          parentId: task.id,
          createdById: tokenPayload.internalUserId,
          internalUserId: assigneeType === AssigneeType.internalUser ? assignee?.id : null,
          clientId: assigneeType === AssigneeType.client ? assignee?.id : null,
          companyId:
            assigneeType === AssigneeType.client
              ? (assignee as ClientResponse)?.companyId
              : assigneeType === AssigneeType.company
                ? assignee?.id
                : null,
        })

        const seedPromiseWithBottleneck = this.bottlenecks.copilot.schedule(() => {
          console.info(`Seeding subtask ${subtask.title}`)
          return this.handleCreate(this.token, subtask)
        })
        seedPromises.push(seedPromiseWithBottleneck)
      }
    }
    const responses = await Promise.all(seedPromises)
    return responses
  }

  async seedTasks(noOfTasks: number, userType: AssigneeType) {
    const [assigneeList, workflowStates, tokenPayload] = await Promise.all([
      this.getAssigneeList(userType),
      this.getAllWorkflowStates(this.token),
      this.getTokenPayload(this.token),
    ])

    const seedPromises = []

    for (let i = 0; i < noOfTasks; i++) {
      if (assigneeList) {
        const assignee = assigneeList[Math.floor(Math.random() * assigneeList.length)]
        let clientId,
          companyId,
          internalUserId = undefined
        if (userType == AssigneeType.client) {
          clientId = assignee.id
          companyId = ClientResponseSchema.parse(assignee).companyId
        } else if (userType == AssigneeType.company) {
          companyId = assignee.id
        } else {
          internalUserId = assignee.id
        }
        const workflowStateId = workflowStates[Math.floor(Math.random() * workflowStates.length)].id
        const createdById = tokenPayload.internalUserId
        const title = faker.music.songName()
        const body = faker.lorem.paragraph()
        const task = CreateTaskRequestSchema.parse({
          internalUserId,
          clientId,
          companyId,
          workflowStateId,
          createdById,
          title,
          body,
        })
        const seedPromiseWithBottleneck = this.bottlenecks.copilot.schedule(() => {
          console.info(`Seeding task ${task.title} `)
          return this.handleCreate(this.token, task)
        })
        seedPromises.push(seedPromiseWithBottleneck)
      }
    }
    const responses = await Promise.all(seedPromises)
    return responses
  }

  private exportToCSV(data: Record<string, any>[], type: AssigneeType) {
    if (data.length === 0) return

    const headers = Object.keys(data[0])
    const csvRows = [headers.join(',')]

    for (const row of data) {
      const values = headers.map((header) => {
        const value = row[header]
        return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
      })
      csvRows.push(values.join(','))
    }

    const csvContent = csvRows.join('\n')
    const outputPath = path.resolve(process.cwd(), `seeded_${type}_${Date.now()}.csv`)

    fs.writeFileSync(outputPath, csvContent)
    console.info(`✅ CSV written to ${outputPath}`)
  }

  private async getTokenPayload(token: string): Promise<Token> {
    const parsed = TokenSchema.safeParse(await this.copilot.getTokenPayload())
    if (!parsed.success) {
      throw new Error('Load testing: invalid or unauthenticated Copilot token payload')
    }
    return parsed.data
  }

  private async getAllWorkflowStates(token: string): Promise<WorkflowStateResponse[]> {
    const res = await fetch(`${this.apiUrl}/api/workflow-states?token=${token}`)

    const data = await res.json()
    return data.workflowStates
  }

  private async handleCreate(token: string, payload: CreateTaskRequest) {
    try {
      console.info('Creating task', payload)
      const response = await fetch(`${this.apiUrl}/api/tasks?token=${token}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return await response.json()
    } catch (e: unknown) {
      console.error('Something went wrong while creating task!', e)
    }
  }
}

export default LoadTester
