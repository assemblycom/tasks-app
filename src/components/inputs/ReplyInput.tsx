import { CopilotAvatar } from '@/components/atoms/CopilotAvatar'
import AttachmentLayout from '@/components/AttachmentLayout'
import { SubmitCommentButtons } from '@/components/buttonsGroup/SubmitCommentButtons'
import { MAX_UPLOAD_LIMIT } from '@/constants/attachments'
import { useWindowWidth } from '@/hooks/useWindowWidth'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { CreateComment } from '@/types/dto/comment.dto'
import { deleteEditorAttachmentsHandler } from '@/utils/attachmentUtils'
import { isTapwriteContentEmpty } from '@/utils/isTapwriteContentEmpty'
import { Box, Stack } from '@mui/material'
import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Tapwrite } from 'tapwrite'
import { createUploadFn } from '@/utils/createUploadFn'
import { AttachmentTypes } from '@/types/interfaces'

interface ReplyInputProps {
  token: string
  task_id: string
  comment: any
  createComment: (postCommentPayload: CreateComment) => void
  focusReplyInput: boolean
  setFocusReplyInput: Dispatch<SetStateAction<boolean>>
}

export const ReplyInput = ({
  token,
  task_id,
  comment,
  createComment,
  focusReplyInput,
  setFocusReplyInput,
}: ReplyInputProps) => {
  const [detail, setDetail] = useState('')
  const { assignee, activeTask } = useSelector(selectTaskBoard)
  const windowWidth = useWindowWidth()
  const isMobile = () => {
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || windowWidth < 600
  }
  const [isUploading, setIsUploading] = useState(false)
  const [isListOrMenuActive, setIsListOrMenuActive] = useState(false)
  const { tokenPayload } = useSelector(selectAuthDetails)
  const currentUserId = tokenPayload?.internalUserId ?? tokenPayload?.clientId
  const currentUserDetails = assignee.find((el) => el.id === currentUserId)
  const [pendingReplies, setPendingReplies] = useState<{ content: string; taskId: string }[]>([])

  const handleReplySubmission = useCallback(() => {
    let content = detail
    const END_P = '<p></p>'
    if (content.slice(-7) === END_P) {
      content = content.slice(0, -7)
    }

    if (!isTapwriteContentEmpty(detail)) {
      setDetail('')
      setPendingReplies((prev) => [...prev, { content, taskId: task_id }])
    }
  }, [comment, detail, task_id])

  useEffect(() => {
    if (pendingReplies.length > 0 && !comment.details.id.includes('temp-comment')) {
      const { content, taskId } = pendingReplies[0]
      createComment({
        content,
        taskId,
        parentId: comment.details.id,
      })
      setPendingReplies((prev) => prev.slice(1)) //handling the reply submission 1 by 1
    }
  }, [comment.details.id, pendingReplies])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!focusReplyInput || isMobile()) {
        return
      }
      if (event.key === 'Enter' && !event.shiftKey && !isListOrMenuActive) {
        event.preventDefault()
        handleReplySubmission()
      }
      if (event.key === 'Enter' && event.ctrlKey) {
        event.preventDefault()
        handleReplySubmission()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [detail, isListOrMenuActive, focusReplyInput, isMobile])

  const handleUploadStatusChange = (uploading: boolean) => {
    setIsUploading(uploading)
  }

  const editorRef = useRef<HTMLDivElement>(document.createElement('div'))
  const [isMultiline, setIsMultiline] = useState(false)

  useEffect(() => {
    if (editorRef.current) {
      const height = editorRef.current.getBoundingClientRect().height
      if (height > 40) setIsMultiline(true)
    }
  }, [detail, editorRef.current])

  useEffect(() => {
    setTimeout(() => {
      if (editorRef.current && focusReplyInput) {
        editorRef.current.focus()
      }
    }, 100)
  }, [focusReplyInput, editorRef.current])

  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (!isDragging) {
      setIsDragging(true)
    }
  }

  const handleDragEnter = () => {
    dragCounter.current += 1
    if (!isDragging) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = () => {
    dragCounter.current -= 1
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    dragCounter.current = 0
  }

  const uploadFn = createUploadFn({
    token,
    workspaceId: activeTask?.workspaceId,
    getEntityId: () => task_id,
  })

  return (
    <>
      <Stack
        direction="row"
        columnGap={'8px'}
        width="100%"
        alignItems="flex-start"
        sx={{
          padding: '8px',
          backgroundColor: (theme) => (isDragging ? theme.color.background.bgCommentDrag : theme.color.gray[100]),
          wordBreak: 'break-word',
          paddingInline: '8px',
        }}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <CopilotAvatar size="xs" style={{ marginTop: '6px' }} currentAssignee={currentUserDetails} />
        <Box onBlur={() => setFocusReplyInput(false)} onFocus={() => setFocusReplyInput(true)} width={'100%'}>
          <Tapwrite
            editorRef={editorRef}
            content={detail}
            getContent={setDetail}
            placeholder="Leave a reply..."
            editorClass="tapwrite-reply-input"
            className={'tapwrite-reply-input'}
            hardbreak
            onActiveStatusChange={(prop) => {
              const { isListActive, isFloatingMenuActive } = prop
              setIsListOrMenuActive(isListActive || isFloatingMenuActive)
            }}
            attachmentLayout={(props) => (
              <AttachmentLayout {...props} isComment={true} onUploadStatusChange={handleUploadStatusChange} />
            )}
            parentContainerStyle={{
              width: '100%',
              maxWidth: '100%',
              display: 'flex',
              flexDirection: isMultiline ? 'column' : 'row',
              overflow: 'hidden',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
              alignItems: isMultiline ? 'normal' : 'center',
              marginTop: isMultiline ? '5px' : '0px',
              flexGrow: 1,
            }}
            addAttachmentButton
            deleteEditorAttachments={(url) => deleteEditorAttachmentsHandler(url, token ?? '', AttachmentTypes.COMMENT)}
            uploadFn={uploadFn}
            maxUploadLimit={MAX_UPLOAD_LIMIT}
            endButtons={<SubmitCommentButtons handleSubmit={handleReplySubmission} disabled={isUploading} />}
          />
        </Box>
      </Stack>
    </>
  )
}
