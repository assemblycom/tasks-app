import type { RealTimeTaskResponse } from '@/hoc/RealTime'
import { isTaskPayloadEqual } from '@/utils/isRealtimePayloadEqual'
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

const buildTaskPayload = ({
  newPayload,
  oldPayload,
}: {
  newPayload: Record<string, unknown>
  oldPayload: Record<string, unknown>
}): RealtimePostgresChangesPayload<RealTimeTaskResponse> =>
  ({
    commit_timestamp: '2026-07-08T12:00:00.000Z',
    errors: [],
    eventType: 'UPDATE',
    new: newPayload,
    old: oldPayload,
    schema: 'public',
    table: 'Tasks',
  }) as unknown as RealtimePostgresChangesPayload<RealTimeTaskResponse>

describe('isTaskPayloadEqual', () => {
  it('ignores no-op updates for task fields', () => {
    const task = {
      id: 'task-1',
      title: 'Prepare docs',
      workflowStateId: 'workflow-state-1',
      associations: [{ companyId: 'company-1' }],
      isShared: true,
    }

    expect(isTaskPayloadEqual(buildTaskPayload({ newPayload: { ...task }, oldPayload: { ...task } }))).toBe(true)
  })

  it('detects changed task fields', () => {
    expect(
      isTaskPayloadEqual(
        buildTaskPayload({
          newPayload: { id: 'task-1', title: 'Prepare docs' },
          oldPayload: { id: 'task-1', title: 'Prepare draft' },
        }),
      ),
    ).toBe(false)
  })

  it('does not recurse through cyclic payload values', () => {
    const newPayload: Record<string, unknown> = { id: 'task-1', title: 'Prepare docs' }
    const oldPayload: Record<string, unknown> = { id: 'task-1', title: 'Prepare docs' }
    newPayload.self = newPayload
    oldPayload.self = oldPayload

    expect(() => isTaskPayloadEqual(buildTaskPayload({ newPayload, oldPayload }))).not.toThrow()
  })
})
