'use client'

import AttachmentLayout from '@/components/AttachmentLayout'
import { PrimaryBtn } from '@/components/buttons/PrimaryBtn'
import { SecondaryBtn } from '@/components/buttons/SecondaryBtn'
import { SelectorType } from '@/components/inputs/Selector'
import { WorkflowStateSelector } from '@/components/inputs/Selector-WorkflowState'
import { StyledTextField } from '@/components/inputs/TextField'
import { MAX_UPLOAD_LIMIT } from '@/constants/attachments'
import { useHandleSelectorComponent } from '@/hooks/useHandleSelectorComponent'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { selectCreateTemplate } from '@/redux/features/templateSlice'
import { CreateTemplateRequest } from '@/types/dto/templates.dto'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { AttachmentTypes } from '@/types/interfaces'
import { deleteEditorAttachmentsHandler, uploadAttachmentHandler } from '@/utils/attachmentUtils'
import { createUploadFn } from '@/utils/createUploadFn'
import { Box, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Tapwrite } from 'tapwrite'

interface SubTemplateFields {
  title: string
  description: string
  workflowStateId: string
}

export const NewTemplateCard = ({
  handleClose,
  handleCreate,
}: {
  handleClose: () => void
  handleCreate: (payload: CreateTemplateRequest) => void
}) => {
  const { workflowStates, token } = useSelector(selectTaskBoard)
  const { showTemplateModal, targetMethod, activeTemplate } = useSelector(selectCreateTemplate)
  const { tokenPayload } = useSelector(selectAuthDetails)

  const [subtemplateFields, setSubtemplateFields] = useState<SubTemplateFields>({
    title: '',
    description: '',
    workflowStateId: '',
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const clearSubTaskFields = () => {
    setSubtemplateFields((prev) => ({
      ...prev,
      title: '',
      description: '',
      workflowStateId: todoWorkflowState.id,
    }))
    updateStatusValue(todoWorkflowState)
  }

  const handleFieldChange = (field: keyof SubTemplateFields, value: string | null) => {
    setSubtemplateFields((prev) => ({
      ...prev,
      [field]: value,
    }))
  }
  const uploadFn = createUploadFn({
    token,
    workspaceId: tokenPayload?.workspaceId,
    attachmentType: AttachmentTypes.TEMPLATE,
  })

  const todoWorkflowState = workflowStates.find((el) => el.key === 'todo') || workflowStates[0]

  useEffect(() => {
    handleFieldChange('workflowStateId', todoWorkflowState.id)
  }, [todoWorkflowState])

  const { renderingItem: _statusValue, updateRenderingItem: updateStatusValue } = useHandleSelectorComponent({
    item: todoWorkflowState,
    type: SelectorType.STATUS_SELECTOR,
  })
  const statusValue = _statusValue as WorkflowStateResponse

  const handleUploadStatusChange = (uploading: boolean) => {
    setIsUploading(uploading)
  }

  const handleTemplateCreation = async () => {
    if (!subtemplateFields.title.trim()) return

    const payload: CreateTemplateRequest = {
      title: subtemplateFields.title,
      body: subtemplateFields.description,
      workflowStateId: subtemplateFields.workflowStateId,
    }
    handleCreate(payload)
    clearSubTaskFields()
    handleClose()
  }

  return (
    <Stack
      direction="column"
      sx={{
        display: 'flex',
        padding: '12px 0px',
        alignItems: 'flex-start',
        alignSelf: 'stretch',
        borderRadius: '4px',
        border: (theme) => `1px solid ${theme.color.borders.border}`,
        boxShadow: '0px 6px 20px 0px rgba(0,0,0, 0.07)',
      }}
    >
      <Stack
        direction="column"
        sx={{ display: 'flex', padding: '0px 12px 12px', alignItems: 'center', gap: '4px', alignSelf: 'stretch' }}
      >
        <Stack direction="row" sx={{ display: 'flex', alignItems: 'flex-end', gap: '4px', alignSelf: 'stretch' }}>
          <StyledTextField
            inputRef={inputRef}
            type="text"
            multiline
            autoFocus={true}
            borderLess
            sx={{
              width: '100%',
              '& .MuiInputBase-input': {
                fontSize: '16px',
                lineHeight: '24px',
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
            placeholder="Task name"
            value={subtemplateFields.title}
            onChange={(event) => {
              handleFieldChange('title', event.target.value)
            }}
            inputProps={{ maxLength: 255 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault() //prevent users from breaking line
              }
            }}
          />
        </Stack>
        <Box sx={{ height: '100%', width: '100%' }}>
          <Tapwrite
            content={subtemplateFields.description}
            getContent={(content) => handleFieldChange('description', content)}
            placeholder="Add description.."
            editorClass="tapwrite-task-editor"
            uploadFn={uploadFn}
            deleteEditorAttachments={(url) => deleteEditorAttachmentsHandler(url, token ?? '', null, null)}
            attachmentLayout={(props) => (
              <AttachmentLayout {...props} isComment={true} onUploadStatusChange={handleUploadStatusChange} />
            )}
            maxUploadLimit={MAX_UPLOAD_LIMIT}
            parentContainerStyle={{ gap: '0px' }}
          />
        </Box>
      </Stack>
      <Stack
        direction="row"
        columnGap={'24px'}
        rowGap={'12px'}
        sx={{
          display: 'flex',
          padding: '0px 12px',
          alignItems: 'center',
          alignSelf: 'stretch',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <Stack
          direction="row"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            alignSelf: 'stretch',
            flexWrap: 'wrap',
          }}
        >
          <WorkflowStateSelector
            option={workflowStates}
            value={statusValue}
            getValue={(value) => {
              updateStatusValue(value)
              handleFieldChange('workflowStateId', value.id)
            }}
            padding={'0px 4px'}
            height={'28px'}
            gap={'6px'}
          />
        </Stack>
        <Stack
          direction="row"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
            alignSelf: 'stretch',

            marginLeft: 'auto',
          }}
        >
          <SecondaryBtn
            padding={'3px 8px'}
            handleClick={handleClose}
            buttonContent={
              <Typography variant="sm" sx={{ color: (theme) => theme.color.gray[700] }}>
                Discard
              </Typography>
            }
          />
          <PrimaryBtn
            padding={'3px 8px'}
            handleClick={handleTemplateCreation}
            buttonText="Create"
            disabled={!subtemplateFields.title.trim() || isUploading}
          />
        </Stack>
      </Stack>
    </Stack>
  )
}
