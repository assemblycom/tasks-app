import { subtaskTemplateBatchSize } from '@/constants/tasks'
import { runInBatches } from '@/utils/array'

describe('task constants', () => {
  it('keeps subtask template fan-out within the production Prisma pool', async () => {
    expect(subtaskTemplateBatchSize).toBe(1)

    const state = { active: 0, max: 0 }

    await runInBatches([1, 2, 3], subtaskTemplateBatchSize, async () => {
      state.active += 1
      state.max = Math.max(state.max, state.active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      state.active -= 1
    })

    expect(state.max).toBe(1)
  })
})
