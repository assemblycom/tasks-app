'use client'

import { updateComment } from '@/app/detail/[task_id]/[user_type]/actions'
import { DotSeparator } from '@/app/detail/ui/DotSeparator'
import {
  BoldTypography,
  CommentCardContainer,
  CustomDivider,
  StyledModal,
  StyledTypography,
} from '@/app/detail/ui/styledComponent'
import AttachmentLayout from '@/components/AttachmentLayout'
import { ListBtn } from '@/components/buttons/ListBtn'
import { EditCommentButtons } from '@/components/buttonsGroup/EditCommentButtons'
import { CollapsibleReplyCard } from '@/components/cards/CollapsibleReplyCard'
import { DeletedCommentCard } from '@/components/cards/DeletedCommentCard'
import { ReplyCard } from '@/components/cards/ReplyCard'
import { MenuBox } from '@/components/inputs/MenuBox'
import { ReplyInput } from '@/components/inputs/ReplyInput'
import { ConfirmDeleteUI } from '@/components/layouts/ConfirmDeleteUI'
import { MAX_UPLOAD_LIMIT } from '@/constants/attachments'
import { usePostAttachment } from '@/hoc/PostAttachmentProvider'
import { useWindowWidth } from '@/hooks/useWindowWidth'
import { PencilIcon, ReplyIcon, TrashIcon } from '@/icons'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { selectTaskDetails, setExpandedComments, setOpenImage } from '@/redux/features/taskDetailsSlice'
import store from '@/redux/store'
import { CommentResponse, CreateComment, UpdateComment } from '@/types/dto/comment.dto'
import { AttachmentTypes, IAssigneeCombined } from '@/types/interfaces'
import { getAssigneeName } from '@/utils/assignee'
import { deleteEditorAttachmentsHandler, getAttachmentPayload, getCustomFilePath } from '@/utils/attachmentUtils'
import { createUploadFn } from '@/utils/createUploadFn'
import { fetcher } from '@/utils/fetcher'
import { getTimeDifference } from '@/utils/getTimeDifference'
import { isTapwriteContentEmpty } from '@/utils/isTapwriteContentEmpty'
import { checkOptimisticStableId, OptimisticUpdate } from '@/utils/optimisticCommentUtils'
import { ReplyResponse } from '@api/activity-logs/schemas/CommentAddedSchema'
import { LogResponse } from '@api/activity-logs/schemas/LogResponseSchema'
import { Box, Collapse, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { TransitionGroup } from 'react-transition-group'
import useSWRMutation from 'swr/mutation'
import { Tapwrite } from 'tapwrite'
import { z } from 'zod'

export const CommentCard = ({
  token,
  comment,
  createComment,
  deleteComment,
  task_id,
  optimisticUpdates,
  commentInitiator,
  'data-comment-card': dataCommentCard, //for selection of the element while highlighting the container in notification
}: {
  token: string
  comment: LogResponse
  createComment: (postCommentPayload: CreateComment) => void
  deleteComment: (id: string, replyId?: string, softDelete?: boolean) => void
  task_id: string
  optimisticUpdates: OptimisticUpdate[]
  commentInitiator: IAssigneeCombined | undefined
  'data-comment-card'?: string
}) => {
  const [showReply, setShowReply] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [replies, setReplies] = useState(comment.details.replies as ReplyResponse[])
  const [timeAgo, setTimeAgo] = useState(getTimeDifference(comment.createdAt))
  const [isReadOnly, setIsReadOnly] = useState<boolean>(true)
  const editRef = useRef<HTMLDivElement>(document.createElement('div'))
  const [focusReplyInput, setFocusedReplyInput] = useState(false)

  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false)
  const { tokenPayload } = useSelector(selectAuthDetails)
  const canEdit = tokenPayload?.internalUserId == comment?.userId || tokenPayload?.clientId == comment?.userId
  const canDelete = tokenPayload?.internalUserId == comment?.userId
  const { assignee, activeTask } = useSelector(selectTaskBoard)
  const { expandedComments } = useSelector(selectTaskDetails)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  const [isFocused, setIsFocused] = useState(false)

  const [deletedReplies, setDeletedReplies] = useState<string[]>([])

  const { postAttachment } = usePostAttachment()

  const windowWidth = useWindowWidth()
  const isMobile = () => {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || windowWidth < 600
  }

  const isXxs = windowWidth < 375 && windowWidth !== 0

  const handleImagePreview = (e: React.MouseEvent<unknown>) => {
    store.dispatch(setOpenImage((e.target as HTMLImageElement).src))
  }

  const content = (comment.details as { content: string }).content || ''
  const [editedContent, setEditedContent] = useState(content)
  const [isListOrMenuActive, setIsListOrMenuActive] = useState(false)

  const firstInitiators = (comment?.details?.firstInitiators as string[])?.map((initiator) => {
    return assignee.find((assignee) => assignee.id == initiator)
  })

  useEffect(() => {
    const updateTimeAgo = () => setTimeAgo(getTimeDifference(comment.createdAt))
    const intervalId = setInterval(updateTimeAgo, 60 * 1000)
    return () => clearInterval(intervalId)
  }, [comment.createdAt])

  const commentIdRef = useRef(comment.details.id)

  useEffect(() => {
    commentIdRef.current = comment.details.id
  }, [comment.details.id]) //done because tapwrite only takes uploadFn once on mount where commentId will be temp from optimistic update. So we need an actual commentId for uploadFn to work.

  const uploadFn = createUploadFn({
    token,
    workspaceId: activeTask?.workspaceId,
    getEntityId: () => z.string().parse(commentIdRef.current),
    attachmentType: AttachmentTypes.COMMENT,
    parentTaskId: task_id,
    onSuccess: (fileUrl, file) => {
      const commentId = z.string().parse(commentIdRef.current)
      postAttachment(getAttachmentPayload(fileUrl, file, commentId, AttachmentTypes.COMMENT))
    },
  })

  const cancelEdit = () => {
    setIsReadOnly(true)
    setEditedContent(content)
  }
  const handleEdit = async () => {
    if (isTapwriteContentEmpty(editedContent)) {
      setEditedContent(content)
      setIsReadOnly(true)
      return
    }
    const commentId = z.string().parse(comment.details.id)
    const updateCommentPayload: UpdateComment = {
      content: editedContent,
      // mentions : add mentions in the future
    }
    token && (await updateComment(token, commentId, updateCommentPayload))
    setIsReadOnly(true)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isFocused || isMobile()) {
        return
      }
      if (event.key === 'Enter' && !event.shiftKey && !isListOrMenuActive) {
        event.preventDefault()
        handleEdit()
      }
      if (event.key === 'Enter' && event.ctrlKey) {
        event.preventDefault()
        handleEdit() //Invoke submit if ctrl+enter is pressed at any time
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    // Cleanup the event listener on component unmount
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [editedContent, isListOrMenuActive, isFocused, isMobile])

  const replyCount = (comment.details as CommentResponse).replyCount

  const cacheKey = `/api/comments/?token=${token}&parentId=${comment.details.id}`
  const { trigger } = useSWRMutation(cacheKey, fetcher, {
    optimisticData: optimisticUpdates.filter((update) => update.tempId),
  })
  const fetchCommentsWithFullReplies = async () => {
    try {
      const updatedComment = await trigger()

      setReplies(updatedComment?.comments || comment.details.replies || [])
      store.dispatch(setExpandedComments([...expandedComments, z.string().parse(comment.details.id ?? '')]))
    } catch (error) {
      console.error('Failed to fetch replies:', error)
    }
  }

  useEffect(() => {
    const replies = (comment.details.replies as ReplyResponse[]) || []

    if (expandedComments.length && expandedComments.includes(z.string().parse(comment.details.id))) {
      const lastReply = replies[replies.length - 1]
      if (deletedReplies.length > 0) {
        const pendingReplyToBeRemoved = deletedReplies[0]
        setReplies((prev) => prev.filter((reply) => reply.id !== pendingReplyToBeRemoved))
        setDeletedReplies((prev) => prev.slice(1))
        return
      } //handle optimistic updates on reply deletion when view all button is active.
      if (lastReply && lastReply.id.includes('temp-comment')) {
        setReplies((prev) => [...prev, lastReply])
        return
      } //handle optimistic updates on reply creation when view all button is active.
      fetchCommentsWithFullReplies()
    } else {
      setReplies(replies)
    }
  }, [comment])
  return (
    <CommentCardContainer
      {...(dataCommentCard ? { 'data-comment-card': dataCommentCard } : {})}
      sx={{
        backgroundColor: (theme) => (isReadOnly ? `${theme.color.gray[100]}` : `${theme.color.base.white}`),
        overflow: 'hidden',
      }}
    >
      <Stack direction="column">
        {comment.details.deletedAt ? (
          <DeletedCommentCard />
        ) : (
          <Stack
            direction="column"
            rowGap={'2px'}
            sx={{ padding: '8px' }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {isReadOnly && (
              <Stack direction="row" justifyContent={'space-between'} alignItems="flex-end">
                <Stack direction="row" columnGap={1} alignItems="center" sx={{ display: 'flex', flexWrap: 'wrap' }}>
                  {commentInitiator ? (
                    <BoldTypography
                      sx={{
                        maxWidth: { xs: isXxs ? '100px' : '225px', sm: '300px', sd: '380px', md: '520px' },
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {getAssigneeName(commentInitiator, '')}
                    </BoldTypography>
                  ) : (
                    <Typography
                      variant="md"
                      sx={{
                        fontStyle: 'italic',
                        maxWidth: { xs: isXxs ? '150px' : '225px', sm: '300px', sd: '375px', md: '500px' },
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Deleted User
                    </Typography>
                  )}
                  <Stack direction="row" columnGap={1} alignItems={'center'}>
                    <DotSeparator />
                    <StyledTypography sx={{ lineHeight: '22px' }}>
                      {timeAgo} {comment.details.updatedAt !== comment.details.createdAt ? '(edited)' : ''}
                    </StyledTypography>
                  </Stack>
                </Stack>

                {(isHovered || isMobile() || isMenuOpen) && (
                  <Stack direction="row" columnGap={2} sx={{ height: '10px' }} alignItems="flex-end">
                    <ReplyButton
                      handleClick={() => {
                        setShowReply((prev) => !prev)
                        setFocusedReplyInput(true)
                      }}
                    />
                    {canEdit && (
                      <MenuBox
                        getMenuOpen={(open) => {
                          setIsMenuOpen(open)
                        }}
                        menuContent={
                          <>
                            <ListBtn
                              content="Edit comment"
                              handleClick={() => {
                                setIsReadOnly(false)
                                if (editRef.current) {
                                  editRef.current.focus()
                                }
                              }}
                              icon={<PencilIcon />}
                              contentColor={(theme) => theme.color.text.text}
                              width="175px"
                              height="33px"
                            />

                            {canDelete && (
                              <ListBtn
                                content="Delete comment"
                                handleClick={() => {
                                  setShowConfirmDeleteModal(true)
                                }}
                                icon={<TrashIcon />}
                                contentColor={(theme) => theme.color.error}
                                width="175px"
                                height="33px"
                              />
                            )}
                          </>
                        }
                        isSecondary
                        width={'22px'}
                        height={'22px'}
                        displayButtonBackground={false}
                        noHover={false}
                      />
                    )}
                  </Stack>
                )}
              </Stack>
            )}
            <Box onBlur={() => setIsFocused(false)} onFocus={() => setIsFocused(true)}>
              <Tapwrite
                content={editedContent}
                onActiveStatusChange={(prop) => {
                  const { isListActive, isFloatingMenuActive } = prop
                  setIsListOrMenuActive(isListActive || isFloatingMenuActive)
                }}
                getContent={setEditedContent}
                readonly={isReadOnly}
                editorRef={editRef}
                editorClass={isReadOnly ? 'tapwrite-comment' : 'tapwrite-comment-editable'}
                addAttachmentButton={!isReadOnly}
                uploadFn={uploadFn}
                deleteEditorAttachments={(url) => {
                  const commentId = z.string().parse(commentIdRef.current)
                  const customFilePath = tokenPayload?.workspaceId
                    ? getCustomFilePath(tokenPayload?.workspaceId, task_id, commentId, url)
                    : undefined
                  return deleteEditorAttachmentsHandler(url, token ?? '', AttachmentTypes.COMMENT, commentId, customFilePath)
                }}
                maxUploadLimit={MAX_UPLOAD_LIMIT}
                attachmentLayout={(props) => <AttachmentLayout {...props} isComment={true} />}
                hardbreak
                parentContainerStyle={{
                  width: '100%',
                  maxWidth: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}
                endButtons={<EditCommentButtons cancelEdit={cancelEdit} handleEdit={handleEdit} isReadOnly={isReadOnly} />}
                handleImageDoubleClick={handleImagePreview}
              />
            </Box>
          </Stack>
        )}

        {((Array.isArray((comment as LogResponse).details?.replies) &&
          ((comment as LogResponse).details.replies as ReplyResponse[]).length > 0) ||
          showReply) && <CustomDivider />}
        {replyCount > 3 && !expandedComments.includes(z.string().parse(comment.details.id)) && (
          <CollapsibleReplyCard
            lastAssignees={firstInitiators}
            fetchCommentsWithFullReplies={fetchCommentsWithFullReplies}
            replyCount={replyCount}
          />
        )}
        <TransitionGroup>
          {Array.isArray((comment as LogResponse).details?.replies) &&
            replies.map((item: ReplyResponse) => {
              const replyInitiator = assignee.find((assignee) => assignee.id == item.initiatorId)
              return (
                <Collapse key={checkOptimisticStableId(item, optimisticUpdates)}>
                  <ReplyCard
                    token={token}
                    item={item}
                    task_id={task_id}
                    handleImagePreview={handleImagePreview}
                    deleteReply={deleteComment}
                    setDeletedReplies={setDeletedReplies}
                    replyInitiator={replyInitiator}
                  />
                </Collapse>
              )
            })}
        </TransitionGroup>
        {(Array.isArray((comment as LogResponse).details?.replies) &&
          ((comment as LogResponse).details.replies as LogResponse[]).length > 0) ||
        showReply ? (
          <ReplyInput
            token={token}
            comment={comment}
            task_id={task_id}
            createComment={createComment}
            focusReplyInput={focusReplyInput}
            setFocusReplyInput={setFocusedReplyInput}
          />
        ) : null}
      </Stack>
      <StyledModal
        open={showConfirmDeleteModal}
        onClose={() => setShowConfirmDeleteModal(false)}
        aria-labelledby="delete-task-modal"
        aria-describedby="delete-task"
      >
        <ConfirmDeleteUI
          handleCancel={() => setShowConfirmDeleteModal(false)}
          handleDelete={() => {
            deleteComment((comment as LogResponse).details.id as string, undefined, replies.length > 0)
            setShowConfirmDeleteModal(false)
          }}
          bodyTag="comment"
        />
      </StyledModal>
    </CommentCardContainer>
  )
}

const ReplyButton = ({ handleClick }: { handleClick: () => void }) => {
  return (
    <Box
      sx={{
        padding: '3px',
        borderRadius: '4px',
        alignItems: 'center',
        display: 'flex',
        ':hover': {
          backgroundColor: (theme) => theme.color.gray[150],
        },
        cursor: 'pointer',
      }}
      onClick={handleClick}
    >
      <ReplyIcon />
    </Box>
  )
}
