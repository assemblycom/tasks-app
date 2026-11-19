import { getCommentActivityId, isPendingCommentId } from '@/utils/commentActivity'

describe('commentActivity utils', () => {
  describe('getCommentActivityId', () => {
    it('returns a string id when activity details contain one', () => {
      expect(getCommentActivityId({ id: 'comment-id' })).toBe('comment-id')
    })

    it('returns undefined for missing, empty, or non-string ids', () => {
      expect(getCommentActivityId(undefined)).toBeUndefined()
      expect(getCommentActivityId({})).toBeUndefined()
      expect(getCommentActivityId({ id: '' })).toBeUndefined()
      expect(getCommentActivityId({ id: 123 })).toBeUndefined()
    })
  })

  describe('isPendingCommentId', () => {
    it('detects optimistic comment ids', () => {
      expect(isPendingCommentId('temp-comment-123')).toBe(true)
    })

    it('treats missing ids as not pending without throwing', () => {
      expect(isPendingCommentId(undefined)).toBe(false)
    })
  })
})
