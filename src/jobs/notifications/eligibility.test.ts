import { AssigneeType, TaskReminderType } from '@prisma/client'

const mockQueryRaw = jest.fn()

jest.mock('@/lib/db', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({ $queryRaw: mockQueryRaw }),
  },
}))

import DBClient from '@/lib/db'
import { getEligibleReminders } from './eligibility'

describe('getEligibleReminders', () => {
  beforeEach(() => {
    mockQueryRaw.mockReset()
  })

  it('returns rows verbatim from the underlying $queryRaw call', async () => {
    const rows = [
      {
        taskId: 't1',
        workspaceId: 'ws1',
        assigneeId: 'c1',
        assigneeType: AssigneeType.client,
        companyId: 'co1',
        reminderType: TaskReminderType.NO_DUE_DATE_3D,
      },
    ]
    mockQueryRaw.mockResolvedValueOnce(rows)

    const result = await getEligibleReminders(DBClient.getInstance())

    expect(result).toEqual(rows)
  })

  it('returns an empty array when no tasks are eligible', async () => {
    mockQueryRaw.mockResolvedValueOnce([])
    const result = await getEligibleReminders(DBClient.getInstance())
    expect(result).toEqual([])
  })

  it('issues exactly one $queryRaw call', async () => {
    mockQueryRaw.mockResolvedValueOnce([])
    await getEligibleReminders(DBClient.getInstance())
    expect(mockQueryRaw).toHaveBeenCalledTimes(1)
  })

  it('propagates errors from $queryRaw', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('connection refused'))
    await expect(getEligibleReminders(DBClient.getInstance())).rejects.toThrow('connection refused')
  })
})
