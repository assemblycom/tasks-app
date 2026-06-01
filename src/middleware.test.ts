import { shouldShortCircuitDetailHeadRequest } from '@/middleware'

describe('shouldShortCircuitDetailHeadRequest', () => {
  it('short-circuits HEAD requests to valid task detail routes', () => {
    expect(shouldShortCircuitDetailHeadRequest('HEAD', '/detail/9474a765-95dc-445f-aaca-7f950acdbdce/iu')).toBe(true)
    expect(shouldShortCircuitDetailHeadRequest('HEAD', '/detail/92149834-0854-483b-bd14-2bed91d1182a/cu')).toBe(true)
  })

  it('does not short-circuit GET detail renders', () => {
    expect(shouldShortCircuitDetailHeadRequest('GET', '/detail/9474a765-95dc-445f-aaca-7f950acdbdce/iu')).toBe(false)
  })

  it('does not short-circuit unrelated or malformed paths', () => {
    expect(shouldShortCircuitDetailHeadRequest('HEAD', '/client')).toBe(false)
    expect(shouldShortCircuitDetailHeadRequest('HEAD', '/detail/not-a-task-id/iu')).toBe(false)
    expect(shouldShortCircuitDetailHeadRequest('HEAD', '/detail/9474a765-95dc-445f-aaca-7f950acdbdce/admin')).toBe(false)
  })
})
