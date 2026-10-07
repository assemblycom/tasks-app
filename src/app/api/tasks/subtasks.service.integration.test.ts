import { buildLtree } from '@/utils/ltree'
import User from '@api/core/models/User.model'
import { SubtaskService } from '@api/tasks/subtasks.service'

import { disconnectTestDb, getTestDb, seedTask, truncateAll, uuid } from '../../../../test/integration/db'

// Real DB; Copilot is doubled only so the service constructs without a live SDK client.
jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation(() => ({})),
}))

const makeUser = (workspaceId: string) => new User('token', { internalUserId: uuid(), workspaceId } as never)

// seedTask doesn't set the ltree path; mirror the app's addPathToTask here.
const setPath = async (id: string, ...pathIds: string[]) => {
  const path = buildLtree(...pathIds)
  await getTestDb().$executeRaw`UPDATE "Tasks" SET path = ${path}::ltree WHERE id::text = ${id}`
}

describe('SubtaskService.softDeleteAllSubtasks (integration)', () => {
  beforeEach(truncateAll)
  afterAll(disconnectTestDb)

  // OUT-4029: deletion is scoped by id + workspaceId. A task in another workspace must
  // never be soft-deleted when we delete the acting workspace's subtree.
  it('deletes only the acting workspace subtree and leaves other workspaces untouched', async () => {
    const workspaceA = 'ws-a'
    const workspaceB = 'ws-b'

    // Root is soft-deleted before softDeleteAllSubtasks runs (as at the real call sites),
    // so the descendant query returns only the live child.
    const rootA = await seedTask({ workspaceId: workspaceA, deletedAt: new Date() })
    const childA = await seedTask({ workspaceId: workspaceA, parentId: rootA })
    await setPath(rootA, rootA)
    await setPath(childA, rootA, childA)

    const taskB = await seedTask({ workspaceId: workspaceB })
    await setPath(taskB, taskB)

    await new SubtaskService(makeUser(workspaceA)).softDeleteAllSubtasks(rootA)

    const db = getTestDb()
    const [ca, b] = await Promise.all([
      db.task.findUnique({ where: { id: childA }, select: { deletedAt: true } }),
      db.task.findUnique({ where: { id: taskB }, select: { deletedAt: true } }),
    ])

    expect(ca?.deletedAt).not.toBeNull()
    expect(b?.deletedAt).toBeNull()
  })
})
