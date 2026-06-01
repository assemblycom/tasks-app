import { getTaskPath } from '@api/tasks/taskPath.utils'
import { PrismaClient } from '@prisma/client'

const db = {
  $queryRaw: jest.fn(),
} as unknown as PrismaClient

const queryRaw = db.$queryRaw as jest.Mock

describe('getTaskPath', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns the stored path when it is already set', async () => {
    queryRaw.mockResolvedValueOnce([{ path: 'parent.task' }])

    await expect(getTaskPath(db, 'workspace-id', 'cb098a99-60cd-4712-bc22-adf628dd3525')).resolves.toBe(
      'parent.task',
    )
    expect(queryRaw).toHaveBeenCalledTimes(1)
  })

  it('derives and backfills a missing path', async () => {
    queryRaw.mockResolvedValueOnce([{ path: null }]).mockResolvedValueOnce([{ path: 'parent.task' }])

    await expect(getTaskPath(db, 'workspace-id', 'cb098a99-60cd-4712-bc22-adf628dd3525')).resolves.toBe(
      'parent.task',
    )
    expect(queryRaw).toHaveBeenCalledTimes(2)
  })

  it('returns null when the task does not exist', async () => {
    queryRaw.mockResolvedValueOnce([])

    await expect(getTaskPath(db, 'workspace-id', 'cb098a99-60cd-4712-bc22-adf628dd3525')).resolves.toBeNull()
    expect(queryRaw).toHaveBeenCalledTimes(1)
  })

  it('returns null when a missing path cannot be derived from a root task', async () => {
    queryRaw.mockResolvedValueOnce([{ path: null }]).mockResolvedValueOnce([])

    await expect(getTaskPath(db, 'workspace-id', 'cb098a99-60cd-4712-bc22-adf628dd3525')).resolves.toBeNull()
    expect(queryRaw).toHaveBeenCalledTimes(2)
  })
})
