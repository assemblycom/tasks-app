'use client'

import { ImagePreviewModal } from '@/app/detail/ui/ImagePreviewModal'
import { StyledModal } from '@/app/detail/ui/styledComponent'
import AttachmentLayout from '@/components/AttachmentLayout'
import { StyledTextField } from '@/components/inputs/TextField'
import { ConfirmDeleteUI } from '@/components/layouts/ConfirmDeleteUI'
import { MAX_UPLOAD_LIMIT } from '@/constants/attachments'
import { useDebounce, useDebounceWithCancel } from '@/hooks/useDebounce'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { selectTaskDetails, setOpenImage, setShowConfirmDeleteModal } from '@/redux/features/taskDetailsSlice'
import store from '@/redux/store'
import { CreateAttachmentRequest } from '@/types/dto/attachments.dto'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { UserType } from '@/types/interfaces'
import { getDeleteMessage } from '@/utils/dialogMessages'
import { deleteEditorAttachmentsHandler, getAttachmentPayload, uploadAttachmentHandler } from '@/utils/attachmentUtils'
import { Box } from '@mui/material'
import { MouseEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Tapwrite } from 'tapwrite'
import { createUploadFn } from '@/utils/createUploadFn'

interface Prop {
  task_id: string
  task: TaskResponse
  // attachment: AttachmentResponseSchema[]
  isEditable: boolean
  updateTaskDetail: (detail: string) => void
  updateTaskTitle: (title: string) => void
  deleteTask: () => void
  postAttachment: (postAttachmentPayload: CreateAttachmentRequest) => void
  deleteAttachment: (id: string) => void
  userType: UserType
  token: string
}

export const TaskEditor = ({
  task_id,
  task,
  // attachment,
  isEditable,
  updateTaskDetail,
  updateTaskTitle,
  deleteTask,
  postAttachment,
  deleteAttachment,
  userType,
  token,
}: Prop) => {
  const [updateTitle, setUpdateTitle] = useState('')
  const [updateDetail, setUpdateDetail] = useState('')
  const { showConfirmDeleteModal, openImage } = useSelector(selectTaskDetails)
  const { activeTask } = useSelector(selectTaskBoard)
  const [isUserTyping, setIsUserTyping] = useState(false)
  const [activeUploads, setActiveUploads] = useState(0)

  const handleImagePreview = (e: MouseEvent<unknown>) => {
    store.dispatch(setOpenImage((e.target as HTMLImageElement).src))
  }

  // const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
  //   event.preventDefault()
  //   const files = event.target.files
  //   if (files && files.length > 0) {
  //     const file = files[0]
  //     const supabaseActions = new SupabaseActions()
  //     const signedUrl: ISignedUrlUpload = await getSignedUrlUpload(generateRandomString(file.name))
  //     const filePayload = await supabaseActions.uploadAttachment(file, signedUrl, task_id)
  //     if (filePayload) {
  //       postAttachment({ ...filePayload, taskId: filePayload.taskId })
  //     }
  //   }
  // }

  const didMount = useRef(false)

  useEffect(() => {
    if (!isUserTyping && activeUploads === 0) {
      const currentTask = activeTask?.id === task_id ? activeTask : task
      if (currentTask) {
        setUpdateTitle(currentTask.title || '')
        setUpdateDetail(currentTask.body ?? '')
      }
    }
  }, [activeTask?.title, activeTask?.body, task_id, activeUploads, task])

  const _titleUpdateDebounced = async (title: string) => updateTaskTitle(title)

  const [titleUpdateDebounced, cancelTitleUpdateDebounced] = useDebounceWithCancel(_titleUpdateDebounced, 1500)

  const _detailsUpdateDebounced = async (details: string) => updateTaskDetail(details)
  const detailsUpdateDebounced = useDebounce(_detailsUpdateDebounced)

  const resetTypingFlag = useCallback(() => {
    setIsUserTyping(false)
  }, [])

  const [debouncedResetTypingFlag, _cancelDebouncedResetTypingFlag] = useDebounceWithCancel(resetTypingFlag, 1500)
  const [debouncedResetTypingFlagTitle, cancelDebouncedResetTypingFlagTitle] = useDebounceWithCancel(resetTypingFlag, 2500)

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value
    setUpdateTitle(newTitle)
    if (newTitle.trim() == '') {
      cancelTitleUpdateDebounced()
      cancelDebouncedResetTypingFlagTitle()
      return
    }
    setIsUserTyping(true)
    titleUpdateDebounced(newTitle)
    debouncedResetTypingFlagTitle()
  }

  const handleTitleBlur = () => {
    if (updateTitle.trim() == '') {
      setTimeout(() => {
        const currentTask = activeTask
        setUpdateTitle(currentTask?.title ?? '')
      }, 300)
    }
  }

  const handleDetailChange = (content: string) => {
    if (!didMount.current) {
      didMount.current = true
      return //skip the update on first mount.
    }
    if (content === updateDetail) {
      return
    }

    setUpdateDetail(content)
    setIsUserTyping(true)
    detailsUpdateDebounced(content)
    debouncedResetTypingFlag()
  }

  const uploadFn = createUploadFn({
    token,
    workspaceId: task.workspaceId,
    getEntityId: () => task_id,
    onUploadStart: () => setActiveUploads((prev) => prev + 1),
    onUploadEnd: () => setActiveUploads((prev) => prev - 1),
    onSuccess: (fileUrl, file) => {
      postAttachment(getAttachmentPayload(fileUrl, file, task_id))
    },
  })

  return (
    <>
      <StyledTextField
        type="text"
        multiline
        borderLess
        sx={{
          width: '100%',
          '& .MuiInputBase-input': {
            fontSize: '20px',
            lineHeight: '28px',
            color: (theme) => theme.color.gray[600],
            fontWeight: 500,
          },
          '& .MuiInputBase-input.Mui-disabled': {
            WebkitTextFillColor: (theme) => theme.color.gray[600],
          },
          '& .MuiInputBase-root': {
            padding: '0px 0px',
          },
        }}
        value={updateTitle}
        onChange={handleTitleChange}
        InputProps={{ readOnly: !isEditable }}
        inputProps={{ maxLength: 255 }}
        disabled={!isEditable}
        padding="0px"
        onBlur={handleTitleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault() //prevent users from breaking line
          }
        }}
      />

      <Box mt="12px" sx={{ height: '100%', width: '100%' }}>
        <Tapwrite
          content={updateDetail}
          getContent={(content: string) => {
            if (updateDetail !== '') {
              handleDetailChange(content)
            }
          }}
          readonly={!isEditable}
          editorClass="tapwrite-task-editor"
          placeholder="Add description..."
          uploadFn={uploadFn}
          handleImageDoubleClick={handleImagePreview}
          deleteEditorAttachments={(url) => deleteEditorAttachmentsHandler(url, token ?? '', task_id, null)}
          attachmentLayout={(props) => <AttachmentLayout {...props} />}
          addAttachmentButton
          maxUploadLimit={MAX_UPLOAD_LIMIT}
        />
      </Box>

      {/* {advancedFeatureFlag && ( */}
      {/* <> */}
      {/*     <Stack direction="row" columnGap={3} rowGap={3} mt={3} flexWrap={'wrap'}> */}
      {/*       {attachment?.map((el, key) => { */}
      {/*         return ( */}
      {/*           <Box key={key}> */}
      {/*             <AttachmentCard */}
      {/*               file={el} */}
      {/*               deleteAttachment={async (event: any) => { */}
      {/*                 event.stopPropagation() */}
      {/*                 const supabaseActions = new SupabaseActions() */}
      {/*                 const { data } = await supabaseActions.removeAttachment(el.filePath) */}
      {/*                 if (data && el.id) { */}
      {/*                   deleteAttachment(el.id) */}
      {/*                 } */}
      {/*               }} */}
      {/*             /> */}
      {/*           </Box> */}
      {/*         ) */}
      {/*       })} */}
      {/*     </Stack> */}

      {/*     <Stack direction="row" mt={3} justifyContent="flex-end"> */}
      {/*       <AttachmentInput handleFileSelect={handleFileSelect} /> */}
      {/*     </Stack> */}
      {/*   </> */}
      {/* )} */}

      <StyledModal
        open={showConfirmDeleteModal}
        onClose={() => store.dispatch(setShowConfirmDeleteModal())}
        aria-labelledby="delete-task-modal"
        aria-describedby="delete-task"
      >
        <ConfirmDeleteUI
          handleCancel={() => store.dispatch(setShowConfirmDeleteModal())}
          handleDelete={() => {
            deleteTask()
            store.dispatch(setShowConfirmDeleteModal())
          }}
          description={getDeleteMessage({ subtaskCount: activeTask?.subtaskCount })}
        />
      </StyledModal>

      <ImagePreviewModal />
    </>
  )
}
