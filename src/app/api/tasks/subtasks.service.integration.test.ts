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

  // Reproduces OUT-4029: colliding label strings across workspaces must not cause cross-workspace deletes.
  it('deletes only the acting workspace subtree when a descendant shares a label string with another workspace', async () => {
    const workspaceA = 'ws-a'
    const workspaceB = 'ws-b'
    const sharedLabel = 'THE10-001'

    // Root is soft-deleted before softDeleteAllSubtasks runs (as in the real call sites), so
    // the query returns only live descendants — the collision is on childA.
    const rootA = await seedTask({ workspaceId: workspaceA, label: 'THE10-000', deletedAt: new Date() })
    const childA = await seedTask({ workspaceId: workspaceA, parentId: rootA, label: sharedLabel })
    await setPath(rootA, rootA)
    await setPath(childA, rootA, childA)

    // Different workspace, different id, but the SAME label string as descendant childA.
    const taskB = await seedTask({ workspaceId: workspaceB, label: sharedLabel })
    await setPath(taskB, taskB)

    await new SubtaskService(makeUser(workspaceA)).softDeleteAllSubtasks(rootA)

    const db = getTestDb()
    const [ca, b] = await Promise.all([
      db.task.findUnique({ where: { id: childA }, select: { deletedAt: true } }),
      db.task.findUnique({ where: { id: taskB }, select: { deletedAt: true } }),
    ])

    expect(ca?.deletedAt).not.toBeNull()
    // The colliding-label task in the other workspace must survive.
    expect(b?.deletedAt).toBeNull()
  })
})
