import { CopilotAvatar } from '@/components/atoms/CopilotAvatar'
import { CommentCard } from '@/components/cards/CommentCard'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { CreateComment } from '@/types/dto/comment.dto'
import { OptimisticUpdate } from '@/utils/optimisticCommentUtils'
import { LogResponse } from '@api/activity-logs/schemas/LogResponseSchema'
import { Stack } from '@mui/material'
import { useSelector } from 'react-redux'
import { VerticalLine } from './styledComponent'
import { Icon } from 'copilot-design-system'

interface Prop {
  token: string
  comment: LogResponse
  createComment: (postCommentPayload: CreateComment) => void
  deleteComment: (id: string, replyId?: string, softDelete?: boolean) => void
  task_id: string
  stableId: string
  optimisticUpdates: OptimisticUpdate[]
}

export const Comments = ({ token, comment, createComment, deleteComment, task_id, stableId, optimisticUpdates }: Prop) => {
  const { assignee } = useSelector(selectTaskBoard)
  const commentInitiator = assignee.find((assignee) => assignee.id == comment.userId)
  return (
    <Stack id={stableId} direction="row" columnGap={2} position="relative">
      <VerticalLine />
      <Stack direction="row" columnGap={2} padding={'0px 0px 12px 0px'} width={'100%'}>
        <CopilotAvatar
          size="xs"
          currentAssignee={commentInitiator}
          style={{
            marginTop: '8px',
          }}
          icon={comment.details.deletedAt ? <Icon icon="Trash" width={10} height={10} /> : undefined}
        />

        <CommentCard
          token={token}
          data-comment-card="true"
          comment={comment}
          createComment={createComment}
          deleteComment={deleteComment}
          task_id={task_id}
          optimisticUpdates={optimisticUpdates}
          commentInitiator={commentInitiator}
        />
      </Stack>
    </Stack>
  )
}
