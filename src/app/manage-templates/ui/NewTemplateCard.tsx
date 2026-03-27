'use client'

import AttachmentLayout from '@/components/AttachmentLayout'
import { PrimaryBtn } from '@/components/buttons/PrimaryBtn'
import { SecondaryBtn } from '@/components/buttons/SecondaryBtn'
import { SelectorType } from '@/components/inputs/Selector'
import { WorkflowStateSelector } from '@/components/inputs/Selector-WorkflowState'
import { TitleEditor } from '@/components/inputs/tiptap/TitleEditor'
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
import {
  TapwriteDynamicFieldDropdown,
  TapwriteDynamicFieldTemplate,
  tapwriteDynamicFields,
} from '@/components/inputs/TapwriteDynamicFieldDropdown'
import { Box, Stack, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
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
        <Box sx={{ padding: '0px', width: '100%' }}>
          <TitleEditor
            value={subtemplateFields.title}
            onChange={(value) => handleFieldChange('title', value)}
            placeholder="Task name"
            autoFocus
            fontSize="16px"
            lineHeight="24px"
            fontWeight={500}
          />
        </Box>
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
            dynamicFieldConfig={{
              fields: tapwriteDynamicFields,
              dropdownComponent: TapwriteDynamicFieldDropdown,
              templateComponent: TapwriteDynamicFieldTemplate,
            }}
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
