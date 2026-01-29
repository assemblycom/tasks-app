'use client'

import { ReplyResponse } from '@/app/api/activity-logs/schemas/CommentAddedSchema'
import { updateComment } from '@/app/detail/[task_id]/[user_type]/actions'
import { DotSeparator } from '@/app/detail/ui/DotSeparator'
import { BoldTypography, StyledModal, StyledTypography } from '@/app/detail/ui/styledComponent'
import { CopilotAvatar } from '@/components/atoms/CopilotAvatar'
import AttachmentLayout from '@/components/AttachmentLayout'
import { ListBtn } from '@/components/buttons/ListBtn'
import { EditCommentButtons } from '@/components/buttonsGroup/EditCommentButtons'
import { MenuBox } from '@/components/inputs/MenuBox'
import { ConfirmDeleteUI } from '@/components/layouts/ConfirmDeleteUI'
import { MAX_UPLOAD_LIMIT } from '@/constants/attachments'
import { usePostAttachment } from '@/hoc/PostAttachmentProvider'
import { useWindowWidth } from '@/hooks/useWindowWidth'
import { PencilIcon, TrashIcon } from '@/icons'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { UpdateComment } from '@/types/dto/comment.dto'
import { AttachmentTypes, IAssigneeCombined } from '@/types/interfaces'
import { getAssigneeName } from '@/utils/assignee'
import { deleteEditorAttachmentsHandler, getAttachmentPayload, getCustomFilePath } from '@/utils/attachmentUtils'
import { createUploadFn } from '@/utils/createUploadFn'
import { getTimeDifference } from '@/utils/getTimeDifference'
import { isTapwriteContentEmpty } from '@/utils/isTapwriteContentEmpty'
import { Box, Stack } from '@mui/material'
import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Tapwrite } from 'tapwrite'
import { z } from 'zod'

export const ReplyCard = ({
  token,
  item,
  task_id,
  handleImagePreview,
  deleteReply,
  setDeletedReplies,
  replyInitiator,
}: {
  token: string
  item: ReplyResponse
  task_id: string
  handleImagePreview: (e: React.MouseEvent<unknown>) => void
  deleteReply: (id: string, replyId: string) => void
  setDeletedReplies: Dispatch<SetStateAction<string[]>>
  replyInitiator: IAssigneeCombined | undefined
}) => {
  const [isReadOnly, setIsReadOnly] = useState<boolean>(true)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const { activeTask } = useSelector(selectTaskBoard)
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false)
  const { tokenPayload } = useSelector(selectAuthDetails)
  const windowWidth = useWindowWidth()
  const content = (item as { content: string }).content || ''
  const [editedContent, setEditedContent] = useState(content)
  const [isListOrMenuActive, setIsListOrMenuActive] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const editRef = useRef<HTMLDivElement>(document.createElement('div'))

  const commentIdRef = useRef(item.id)

  useEffect(() => {
    commentIdRef.current = item.id
  }, [item.id])

  const canEdit = tokenPayload?.internalUserId == item?.initiatorId || tokenPayload?.clientId == item?.initiatorId

  const isMobile = () => {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || windowWidth < 600
  }

  const isXxs = windowWidth < 375 && windowWidth !== 0
  useEffect(() => {
    setEditedContent(content)
  }, [content])

  const cancelEdit = () => {
    setIsReadOnly(true)
    setEditedContent(content)
  }

  const canDelete = tokenPayload?.internalUserId == item?.initiatorId

  const { postAttachment } = usePostAttachment()

  const handleEdit = async () => {
    if (isTapwriteContentEmpty(editedContent)) {
      setEditedContent(content)
      setIsReadOnly(true)
      return
    }
    const commentId = z.string().parse(item.id)
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

  return (
    <>
      <Stack
        direction="row"
        columnGap={2}
        alignItems="flex-start"
        alignContent="center"
        sx={{
          padding: '8px',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        id={item.id}
      >
        <CopilotAvatar
          size="xs"
          currentAssignee={replyInitiator}
          style={{
            marginTop: '1px',
          }}
        />
        <Stack
          direction="column"
          rowGap={'2px'}
          width={'100%'}
          sx={{
            marginBottom: '-8px',
            paddingBottom: '8px',
            borderBottom: (theme) => `1px solid ${theme.color.gray[150]}`,
            marginRight: '-10px',
            paddingRight: '10px',
          }}
        >
          <Stack direction="row" justifyContent={'space-between'} alignItems="flex-end">
            <Stack direction="row" columnGap={1} alignItems={'center'} sx={{ display: 'flex', flexWrap: 'wrap' }}>
              <BoldTypography
                sx={{
                  maxWidth: { xs: isXxs ? '100px' : '225px', sm: '300px', sd: '375px', md: '500px' },
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {replyInitiator ? getAssigneeName(replyInitiator) : 'Deleted User'}
              </BoldTypography>
              <Stack direction="row" columnGap={1} alignItems={'center'}>
                <DotSeparator />
                <StyledTypography>
                  {' '}
                  {getTimeDifference(item.createdAt)} {item.updatedAt !== item.createdAt ? '(edited)' : ''}
                </StyledTypography>
              </Stack>
            </Stack>
            {(isHovered || isMobile() || isMenuOpen) && canEdit && isReadOnly && (
              <Stack direction="row" columnGap={2} sx={{ height: '10px' }} alignItems="flex-end">
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
              </Stack>
            )}
          </Stack>
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
        <StyledModal
          open={showConfirmDeleteModal}
          onClose={() => setShowConfirmDeleteModal(false)}
          aria-labelledby="delete-reply-modal"
          aria-describedby="delete-reply"
        >
          <ConfirmDeleteUI
            handleCancel={() => setShowConfirmDeleteModal(false)}
            handleDelete={() => {
              setDeletedReplies((prev) => [...prev, item.id])
              deleteReply(item.id as string, item.id)
              setShowConfirmDeleteModal(false)
            }}
            bodyTag="comment"
          />
        </StyledModal>
      </Stack>
    </>
  )
}
