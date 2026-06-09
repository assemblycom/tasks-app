import { getLtreePathFromIds, getTaskPathIds } from '@api/tasks/taskPath.utils'

import { disconnectTestDb, getTestDb, seedTask, truncateAll } from '../../../../test/integration/db'

const workspaceId = 'ws_task_path'

beforeEach(truncateAll)
afterAll(disconnectTestDb)

describe('taskPath.utils integration', () => {
  it('resolves and persists a missing child task path using ltree SQL', async () => {
    const db = getTestDb()
    const rootId = await seedTask({ workspaceId })
    const childId = await seedTask({ workspaceId, parentId: rootId })

    await expect(getTaskPathIds(db, childId, workspaceId)).resolves.toEqual([rootId, childId])

    const rows = await db.$queryRaw<{ path: string | null }[]>`
      SELECT path::text
      FROM "Tasks"
      WHERE id = ${childId}::uuid
        AND "workspaceId" = ${workspaceId}
    `
    expect(rows[0]?.path).toBe(getLtreePathFromIds([rootId, childId]))
  })
})
