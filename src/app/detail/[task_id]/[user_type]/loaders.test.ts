import APIError from '@api/core/exceptions/api'
import { TasksService } from '@api/tasks/tasks.service'
import httpStatus from 'http-status'
import { loadTask } from './loaders'

const mockGetOneTask = jest.fn()

jest.mock('@api/tasks/tasks.service', () => ({
  TasksService: jest.fn().mockImplementation(() => ({
    getOneTask: mockGetOneTask,
  })),
}))

jest.mock('@api/tasks/subtasks.service', () => ({
  SubtaskService: jest.fn(),
}))

jest.mock('@api/view-settings/viewSettings.service', () => ({
  ViewSettingsService: jest.fn(),
}))

describe('detail page loaders', () => {
  const user = {} as ConstructorParameters<typeof TasksService>[0]
  const taskId = '812a7d8b-8db1-477f-a49d-35a1e2f0fec9'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('loadTask', () => {
    it.each([httpStatus.NOT_FOUND, httpStatus.UNAUTHORIZED])(
      'returns null when the task service throws an expected %s error',
      async (status) => {
        mockGetOneTask.mockRejectedValueOnce(new APIError(status, 'Task is not available'))

        await expect(loadTask(user, taskId)).resolves.toBeNull()
      },
    )

    it('rethrows unexpected task service errors', async () => {
      const error = new APIError(httpStatus.INTERNAL_SERVER_ERROR, 'Database is unavailable')
      mockGetOneTask.mockRejectedValueOnce(error)

      await expect(loadTask(user, taskId)).rejects.toBe(error)
    })
  })
})
