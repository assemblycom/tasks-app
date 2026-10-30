import type User from '@api/core/models/User.model'
import { loadSubtaskStatus, loadTask, loadTaskPath } from '@/app/detail/[task_id]/[user_type]/loaders'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { z } from 'zod'

const mockGetOneTask = jest.fn()
const mockGetTraversalPath = jest.fn()
const mockGetSubtaskStatus = jest.fn()

jest.mock('@api/tasks/tasks.service', () => ({
  TasksService: jest.fn().mockImplementation(() => ({
    getOneTask: mockGetOneTask,
    getTraversalPath: mockGetTraversalPath,
  })),
}))

jest.mock('@api/tasks/subtasks.service', () => ({
  SubtaskService: jest.fn().mockImplementation(() => ({
    getSubtaskStatus: mockGetSubtaskStatus,
  })),
}))

jest.mock('@api/view-settings/viewSettings.service', () => ({
  ViewSettingsService: jest.fn().mockImplementation(() => ({
    getViewSettingsForUser: jest.fn(),
  })),
}))

const user = { workspaceId: 'workspace-id' } as User

const createPrismaError = ({
  code,
  meta,
}: {
  code: string
  meta?: Record<string, unknown>
}): PrismaClientKnownRequestError =>
  new PrismaClientKnownRequestError('Prisma known request error', {
    code,
    clientVersion: '5.19.0',
    meta,
  })

describe('detail loaders', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('treats invalid UUID Prisma raw-query errors as a missing task', async () => {
    mockGetOneTask.mockRejectedValue(createPrismaError({ code: 'P2010', meta: { code: '22P02' } }))

    await expect(loadTask(user, 'not-a-uuid')).resolves.toBeNull()
  })

  it('treats invalid UUID Prisma column errors as an empty traversal path', async () => {
    mockGetTraversalPath.mockRejectedValue(
      createPrismaError({ code: 'P2023', meta: { message: 'Error creating UUID, invalid length: expected length 32' } }),
    )

    await expect(loadTaskPath(user, 'not-a-uuid')).resolves.toEqual([])
  })

  it('treats Zod UUID validation errors as no renderable subtask status', async () => {
    mockGetSubtaskStatus.mockRejectedValue(z.string().uuid().safeParse('not-a-uuid').error)

    await expect(loadSubtaskStatus(user, 'not-a-uuid')).resolves.toEqual({ count: 0, canCreateSubtask: false })
  })

  it('still rethrows unrelated Prisma errors', async () => {
    const error = createPrismaError({ code: 'P2002', meta: { target: ['id'] } })
    mockGetOneTask.mockRejectedValue(error)

    await expect(loadTask(user, 'task-id')).rejects.toBe(error)
  })
})
