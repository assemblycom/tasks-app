'use client'

import { StyledModal } from '@/app/detail/ui/styledComponent'
import AttachmentLayout from '@/components/AttachmentLayout'
import { StyledTextField } from '@/components/inputs/TextField'
import { ConfirmDeleteUI } from '@/components/layouts/ConfirmDeleteUI'
import { MAX_UPLOAD_LIMIT } from '@/constants/attachments'
import { useDebounce, useDebounceWithCancel } from '@/hooks/useDebounce'
import { selectTaskDetails, setOpenImage, setShowConfirmDeleteModal } from '@/redux/features/taskDetailsSlice'
import { clearTemplateFields, selectCreateTemplate } from '@/redux/features/templateSlice'
import store from '@/redux/store'
import { CreateTemplateRequest } from '@/types/dto/templates.dto'
import { AttachmentTypes, ITemplate } from '@/types/interfaces'
import { deleteEditorAttachmentsHandler, uploadAttachmentHandler } from '@/utils/attachmentUtils'
import { createUploadFn } from '@/utils/createUploadFn'
import { Box } from '@mui/material'
import { MouseEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Tapwrite } from 'tapwrite'

interface TemplateDetailsProps {
  template: ITemplate
  template_id: string
  handleDeleteTemplate: (templateId: string) => void
  handleEditTemplate: (payload: CreateTemplateRequest, templateId: string) => void
  updateTemplateDetail: (detail: string) => void
  updateTemplateTitle: (title: string) => void
  token: string
}

export default function TemplateDetails({
  template,
  template_id,
  handleDeleteTemplate,
  handleEditTemplate,
  updateTemplateDetail,
  updateTemplateTitle,
  token,
}: TemplateDetailsProps) {
  const [updateTitle, setUpdateTitle] = useState('')
  const [updateDetail, setUpdateDetail] = useState('')
  const { activeTemplate, targetTemplateId, taskName } = useSelector(selectCreateTemplate)
  const [isUserTyping, setIsUserTyping] = useState(false)
  const [activeUploads, setActiveUploads] = useState(0)

  const { showConfirmDeleteModal } = useSelector(selectTaskDetails)

  const handleImagePreview = (e: MouseEvent<unknown>) => {
    store.dispatch(setOpenImage((e.target as HTMLImageElement).src))
  }
  const didMount = useRef(false)

  useEffect(() => {
    if (!isUserTyping && activeUploads === 0) {
      const currentTemplate = activeTemplate?.id === template_id ? activeTemplate : template
      if (currentTemplate) {
        setUpdateTitle(currentTemplate.title || '')
        setUpdateDetail(currentTemplate.body ?? '')
      }
    }
  }, [activeTemplate?.title, activeTemplate?.body, template_id, activeUploads, template])

  const _titleUpdateDebounced = async (title: string) => updateTemplateTitle(title)
  const [titleUpdateDebounced, cancelTitleUpdateDebounced] = useDebounceWithCancel(_titleUpdateDebounced, 1500)

  const _detailsUpdateDebounced = async (details: string) => updateTemplateDetail(details)
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
        const currentTask = activeTemplate
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
    workspaceId: template.workspaceId,
    getEntityId: () => template_id,
    attachmentType: AttachmentTypes.TEMPLATE,
    onUploadStart: () => setActiveUploads((prev) => prev + 1),
    onUploadEnd: () => setActiveUploads((prev) => prev - 1),
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
        inputProps={{ maxLength: 255 }}
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
          editorClass="tapwrite-task-editor"
          placeholder="Add description..."
          uploadFn={uploadFn}
          handleImageDoubleClick={handleImagePreview}
          deleteEditorAttachments={(url) => deleteEditorAttachmentsHandler(url, token ?? '', template_id, null)}
          attachmentLayout={(props) => <AttachmentLayout {...props} />}
          addAttachmentButton
          maxUploadLimit={MAX_UPLOAD_LIMIT}
        />
      </Box>
      <StyledModal
        open={showConfirmDeleteModal}
        onClose={() => store.dispatch(setShowConfirmDeleteModal())}
        aria-labelledby="delete-task-modal"
        aria-describedby="delete-task"
      >
        <ConfirmDeleteUI
          handleCancel={() => store.dispatch(setShowConfirmDeleteModal())}
          handleDelete={() => {
            store.dispatch(setShowConfirmDeleteModal())
            handleDeleteTemplate(targetTemplateId)
            store.dispatch(clearTemplateFields())
          }}
          description={`“${taskName}” will be permanently deleted.`}
          customBody={'Delete template?'}
        />
      </StyledModal>
    </>
  )
}
