'use client'

import { ReplyResponse } from '@/app/api/activity-logs/schemas/CommentAddedSchema'
import { deleteComment, postComment } from '@/app/detail/[task_id]/[user_type]/actions'
import { ActivityLog } from '@/app/detail/ui/ActivityLog'
import { Comments } from '@/app/detail/ui/Comments'
import { CommentInput } from '@/components/inputs/CommentInput'
import { useDebounce } from '@/hooks/useDebounce'
import useScrollToElement from '@/hooks/useScrollToElement'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { selectTaskDetails } from '@/redux/features/taskDetailsSlice'
import { Token } from '@/types/common'
import { CreateAttachmentRequest } from '@/types/dto/attachments.dto'
import { CreateComment } from '@/types/dto/comment.dto'
import { fetcher } from '@/utils/fetcher'
import { getCommentActivityId, isPendingCommentId } from '@/utils/commentActivity'
import { generateRandomString } from '@/utils/generateRandomString'
import { checkOptimisticStableId, getOptimisticData, getTempLog } from '@/utils/optimisticCommentUtils'
import { LogResponse } from '@api/activity-logs/schemas/LogResponseSchema'
import { Box, Collapse, Skeleton, Stack, Typography } from '@mui/material'
import { ActivityType } from '@prisma/client'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { TransitionGroup } from 'react-transition-group'
import useSWR, { useSWRConfig } from 'swr'

interface OptimisticUpdate {
  tempId: string
  serverId?: string
  timestamp: number
}

export const ActivityWrapper = ({
  token,
  task_id,
  tokenPayload,
}: {
  token: string
  task_id: string
  tokenPayload: Token
}) => {
  const { activeTask, assignee } = useSelector(selectTaskBoard)
  const { expandedComments } = useSelector(selectTaskDetails)
  const task = activeTask
  const didMount = useRef(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>()
  const [optimisticUpdates, setOptimisticUpdates] = useState<OptimisticUpdate[]>([])
  const expandedCommentsQueryString = expandedComments.map((id) => encodeURIComponent(id)).join(',')
  const cacheKey = `/api/tasks/${task_id}/activity-logs?token=${token}`
  const { data: activities, isLoading } = useSWR(`/api/tasks/${task_id}/activity-logs?token=${token}`, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  })
  const { mutate } = useSWRConfig()

  useScrollToElement('commentId')

  const _debounceMutate = (cacheKey: string) =>
    mutate(cacheKey).catch((error) => console.error('Failed to revalidate activity logs:', error))
  const debounceMutate = useDebounce(_debounceMutate, 300)

  const shouldRefetchRef = useRef(true) //preventing double fetching from comment apis. Due to optimistic update revalidation, we are already fetching logs there. So no need to refetch in case for comment creation and deletion.

  useEffect(() => {
    if (task) {
      if (!didMount.current || !shouldRefetchRef.current) {
        didMount.current = true
        shouldRefetchRef.current = true
        setLastUpdated(task?.lastActivityLogUpdated)
        return //skip the refetch on first mount.
      }
      const refetchActivityLog = async () => {
        debounceMutate(cacheKey) //if subsequent update comes under 300 ms, only mutate once.
      }

      if (task?.lastActivityLogUpdated && task?.lastActivityLogUpdated !== lastUpdated) {
        refetchActivityLog()
      }
      setLastUpdated(task?.lastActivityLogUpdated)
    }
  }, [task?.lastActivityLogUpdated])

  const currentUserId = tokenPayload.internalUserId ?? tokenPayload.clientId

  const currentUserDetails = useMemo(() => {
    const currentAssignee = assignee.find((el) => el.id === currentUserId)
    return currentAssignee
  }, [assignee, currentUserId])

  // Handle comment creation
  const handleCreateComment = async (postCommentPayload: CreateComment) => {
    const tempId = generateRandomString('temp-comment')

    setOptimisticUpdates((prev) => [
      ...prev,
      {
        tempId,
        timestamp: Date.now(),
      },
    ])

    const tempLog = getTempLog(tempId, postCommentPayload, task_id, currentUserDetails, currentUserId)
    const optimisticData = getOptimisticData(postCommentPayload, activities.data, tempLog)

    try {
      await mutate(
        cacheKey,
        async () => {
          shouldRefetchRef.current = false
          // Post the actual comment to the server
          const comment = await postComment(token, postCommentPayload)
          setOptimisticUpdates((prev) =>
            prev.map((update) => (update.tempId === tempId ? { ...update, serverId: comment.id } : update)),
          )
          // Return the actual updated data (this will trigger revalidation)
          return await fetcher(cacheKey)
        },
        {
          optimisticData: { data: optimisticData },
          rollbackOnError: true,
          revalidate: false,
        },
      )
    } catch (error) {
      console.error('Failed to post comment:', error)
      setOptimisticUpdates((prev) => prev.filter((update) => update.tempId !== tempId))
    }
  }

  // Handle comment deletion
  const resolveCommentIdToDelete = async (commentId: string): Promise<string | undefined> => {
    if (!isPendingCommentId(commentId)) return commentId

    const attempts = Array.from({ length: 6 })
    for (const _attempt of attempts) {
      const matchedUpdate = optimisticUpdates.find((update) => update.tempId === commentId)
      if (matchedUpdate?.serverId) return matchedUpdate.serverId
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    return undefined
  }

  const handleDeleteComment = async (
    commentId: string | undefined,
    logId: string,
    replyId?: string,
    softDelete?: boolean,
  ) => {
    let optimisticData
    if (replyId) {
      optimisticData = activities
        ? activities.data.map((item: LogResponse) => {
            if (item.id === logId) {
              const updatedReplies = (item.details.replies as ReplyResponse[]).filter(
                (reply: ReplyResponse) => reply.id !== replyId,
              )
              return {
                ...item,
                details: {
                  ...item.details,
                  replies: updatedReplies,
                },
              }
            }
            return item
          })
        : []
    } else {
      if (softDelete) {
        optimisticData = activities
          ? activities.data.map((comment: LogResponse) => {
              if (comment.id === logId) {
                return {
                  ...comment,
                  details: {
                    ...comment.details,
                    deletedAt: new Date().toISOString(),
                  },
                }
              }
              return comment
            })
          : []
      } else {
        optimisticData = activities ? activities.data.filter((comment: LogResponse) => comment.id !== logId) : []
      }
    }

    try {
      await mutate(
        cacheKey,
        async () => {
          shouldRefetchRef.current = false
          const commentIdToDelete = getCommentActivityId({ id: commentId })
          const resolvedCommentId = commentIdToDelete ? await resolveCommentIdToDelete(commentIdToDelete) : undefined
          if (!resolvedCommentId) {
            console.warn('Comment is missing a server id. Try again later.')
            return activities
          }

          await deleteComment(token, resolvedCommentId)
          return await fetcher(cacheKey)
        },
        {
          optimisticData: { data: optimisticData },
          rollbackOnError: true,
          revalidate: false, // Make sure to revalidate after mutation
        },
      )
    } catch (error) {
      console.error('Failed to delete comment:', error)
    }
  }

  return (
    <Box width="100%">
      <Stack direction="column" alignItems="left" p="24px 0px" rowGap={'12px'}>
        <Typography variant="lg">Activity</Typography>
        {isLoading ? (
          <Stack direction="column" rowGap={5}>
            <Skeleton variant="rectangular" width={'100%'} height={15} />
            <Skeleton variant="rectangular" width={'100%'} height={15} />
            <Skeleton variant="rectangular" width={'100%'} height={15} />
          </Stack>
        ) : (
          <Stack direction="column" alignItems="left" rowGap={2}>
            <TransitionGroup>
              {activities?.data?.map((item: LogResponse, index: number) => {
                const commentActivityId = getCommentActivityId(item.details)
                return (
                  <Collapse key={checkOptimisticStableId(item, optimisticUpdates)}>
                    <Box
                      key={index}
                      sx={{
                        height: 'auto',
                      }}
                    >
                      {item.type === ActivityType.COMMENT_ADDED ? (
                        <Comments
                          token={token}
                          comment={item}
                          createComment={handleCreateComment}
                          deleteComment={(commentId, replyId, softDelete) =>
                            handleDeleteComment(commentId, item.id, replyId, softDelete)
                          }
                          task_id={task_id}
                          stableId={commentActivityId ?? item.id}
                          optimisticUpdates={optimisticUpdates}
                        />
                      ) : Object.keys(item).length === 0 ? null : (
                        <ActivityLog log={item} />
                      )}
                    </Box>
                  </Collapse>
                )
              })}
            </TransitionGroup>
            <CommentInput createComment={handleCreateComment} task_id={task_id} token={token} />
          </Stack>
        )}
      </Stack>
    </Box>
  )
}
