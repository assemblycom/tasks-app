import APIError from '@api/core/exceptions/api'
import { getLtreePathFromIds, getTaskPath, getTaskPathIds } from '@api/tasks/taskPath.utils'
import { PrismaClient } from '@prisma/client'
import httpStatus from 'http-status'

type TaskPathRow = {
  id: string
  parentId: string | null
  path: string | null
}

const workspaceId = 'workspace_123'
const rootId = '11111111-1111-4111-8111-111111111111'
const childId = '22222222-2222-4222-8222-222222222222'
const grandchildId = '33333333-3333-4333-8333-333333333333'

const createDb = (rows: TaskPathRow[]) => {
  const rowsById = new Map(rows.map((row) => [row.id, row]))
  return {
    $queryRaw: jest.fn(async (_strings: TemplateStringsArray, taskId: string) => {
      const row = rowsById.get(taskId)
      return row ? [row] : []
    }),
    $executeRaw: jest.fn(async () => 1),
  } as unknown as PrismaClient
}

describe('taskPath.utils', () => {
  it('returns ids from an existing ltree path without writing', async () => {
    const db = createDb([
      {
        id: childId,
        parentId: rootId,
        path: getLtreePathFromIds([rootId, childId]),
      },
    ])

    await expect(getTaskPathIds(db, childId, workspaceId)).resolves.toEqual([rootId, childId])
    expect(db.$executeRaw).not.toHaveBeenCalled()
  })

  it('rebuilds and persists a missing task path from an ancestor path', async () => {
    const db = createDb([
      {
        id: childId,
        parentId: rootId,
        path: null,
      },
      {
        id: rootId,
        parentId: null,
        path: getLtreePathFromIds([rootId]),
      },
    ])

    await expect(getTaskPathIds(db, childId, workspaceId)).resolves.toEqual([rootId, childId])
    expect(db.$executeRaw).toHaveBeenCalledTimes(1)
    expect((db.$executeRaw as jest.Mock).mock.calls[0][1]).toBe(getLtreePathFromIds([rootId, childId]))
  })

  it('rebuilds a missing path by walking to the root task', async () => {
    const db = createDb([
      {
        id: grandchildId,
        parentId: childId,
        path: null,
      },
      {
        id: childId,
        parentId: rootId,
        path: null,
      },
      {
        id: rootId,
        parentId: null,
        path: null,
      },
    ])

    await expect(getTaskPath(db, grandchildId, workspaceId)).resolves.toBe(
      getLtreePathFromIds([rootId, childId, grandchildId]),
    )
    expect(db.$executeRaw).toHaveBeenCalledTimes(1)
    expect((db.$executeRaw as jest.Mock).mock.calls[0][1]).toBe(getLtreePathFromIds([rootId, childId, grandchildId]))
  })

  it('throws not found when a parent in the chain is missing', async () => {
    const db = createDb([
      {
        id: childId,
        parentId: rootId,
        path: null,
      },
    ])

    await expect(getTaskPathIds(db, childId, workspaceId)).rejects.toMatchObject<Partial<APIError>>({
      status: httpStatus.NOT_FOUND,
    })
  })
})
