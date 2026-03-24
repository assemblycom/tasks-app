'use client'

import { PrimaryBtn } from '@/components/buttons/PrimaryBtn'
import { SecondaryBtn } from '@/components/buttons/SecondaryBtn'
import { TokenizedInput, restoreCursorOffset } from '@/components/inputs/TokenizedInput'
import { AppMargin, SizeofAppMargin } from '@/hoc/AppMargin'
import { AttachmentIcon } from '@/icons'
import store from '@/redux/store'
import { Close } from '@mui/icons-material'
import { Box, Stack, Typography, styled } from '@mui/material'
import { AttachmentTypes, createTemplateErrors, TargetMethod } from '@/types/interfaces'
import { useRef } from 'react'
import { useSelector } from 'react-redux'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import {
  clearTemplateFields,
  selectCreateTemplate,
  setCreateTemplateFields,
  setErrors,
  setShowTemplateModal,
} from '@/redux/features/templateSlice'
import { Tapwrite } from 'tapwrite'
import { MAX_UPLOAD_LIMIT } from '@/constants/attachments'
import { WorkflowStateSelector } from '@/components/inputs/Selector-WorkflowState'
import { useHandleSelectorComponent } from '@/hooks/useHandleSelectorComponent'
import { SelectorType } from '@/components/inputs/Selector'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { deleteEditorAttachmentsHandler, uploadAttachmentHandler } from '@/utils/attachmentUtils'
import AttachmentLayout from '@/components/AttachmentLayout'
import { StyledModal } from '@/app/detail/ui/styledComponent'
import { createUploadFn } from '@/utils/createUploadFn'
import {
  TapwriteDynamicFieldDropdown,
  TapwriteDynamicFieldTemplate,
  tapwriteDynamicFields,
} from '@/components/inputs/TapwriteDynamicFieldDropdown'

export const TemplateForm = ({ handleCreate }: { handleCreate: () => void }) => {
  const { workflowStates, assignee } = useSelector(selectTaskBoard)
  const { showTemplateModal, targetMethod } = useSelector(selectCreateTemplate)

  return (
    <StyledModal
      open={showTemplateModal}
      onClose={() => {
        store.dispatch(setShowTemplateModal({}))
        store.dispatch(clearTemplateFields())
      }}
      aria-labelledby="create-task-modal"
      aria-describedby="add-new-task"
    >
      <NewTaskContainer>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            border: (theme) => `1px solid ${theme.color.borders.borderDisabled}`,
            padding: '12px 28px',
          }}
        >
          {targetMethod === TargetMethod.POST ? (
            <Typography variant="lg">Create template</Typography>
          ) : (
            <Typography variant="lg">Edit template</Typography>
          )}
          <Close
            sx={{ color: (theme) => theme.color.gray[500], cursor: 'pointer', width: 20, height: 20 }}
            onClick={() => {
              store.dispatch(setShowTemplateModal({}))
              store.dispatch(clearTemplateFields())
            }}
          />
        </Stack>

        <AppMargin size={SizeofAppMargin.MEDIUM} py="20px">
          <NewTemplateFormInputs />
        </AppMargin>
        <NewTaskFooter handleCreate={handleCreate} targetMethod={targetMethod} />
      </NewTaskContainer>
    </StyledModal>
  )
}

const NewTemplateFormInputs = () => {
  const { taskName, description, errors, activeWorkflowStateId, targetTemplateId, targetMethod } =
    useSelector(selectCreateTemplate)
  const { workflowStates, token } = useSelector(selectTaskBoard)
  const { tokenPayload } = useSelector(selectAuthDetails)
  const titleRef = useRef<HTMLDivElement>(null)

  const uploadFn = createUploadFn({
    token,
    workspaceId: tokenPayload?.workspaceId,
    attachmentType: AttachmentTypes.TEMPLATE,
  })

  const todoWorkflowState = workflowStates.find((el) => el.key === 'todo') || workflowStates[0]
  const defaultWorkflowState = activeWorkflowStateId
    ? workflowStates.find((state) => state.id === activeWorkflowStateId)
    : todoWorkflowState

  const { renderingItem: _statusValue, updateRenderingItem: updateStatusValue } = useHandleSelectorComponent({
    item: defaultWorkflowState,
    type: SelectorType.STATUS_SELECTOR,
  })

  const statusValue = _statusValue as WorkflowStateResponse //typecasting

  const handleTitleChange = (newValue: string) => {
    store.dispatch(setCreateTemplateFields({ targetField: 'taskName', value: newValue }))
    store.dispatch(setErrors({ key: createTemplateErrors.TITLE, value: false }))
  }

  const handleDynamicFieldInsert = (newValue: string, cursorPos: number) => {
    store.dispatch(setCreateTemplateFields({ targetField: 'taskName', value: newValue }))
    store.dispatch(setErrors({ key: createTemplateErrors.TITLE, value: false }))
    setTimeout(() => {
      if (titleRef.current) {
        titleRef.current.focus()
        restoreCursorOffset(titleRef.current, cursorPos)
      }
    }, 0)
  }

  const handleDescriptionChange = (content: string) => {
    store.dispatch(setCreateTemplateFields({ targetField: 'description', value: content }))
  }

  return (
    <>
      <Stack
        direction="column"
        sx={{
          display: 'flex',
          padding: '0px 12px 8px',
          alignItems: 'center',
          gap: '4px',
          alignSelf: 'stretch',
          border: '1px solid #EFF1F4',
          borderRadius: '4px',
          marginBottom: '12px',
        }}
      >
        <TokenizedInput
          ref={titleRef}
          value={taskName}
          onChange={handleTitleChange}
          onInsert={handleDynamicFieldInsert}
          autoFocus
          placeholder="Template name"
          fontSize="16px"
          lineHeight="24px"
          padding="8px 0px 0px"
        />
        {errors.title && (
          <Typography variant="bodySm" sx={{ color: '#d32f2f', textAlign: 'right', width: '100%', fontSize: '12px' }}>
            Enter template name
          </Typography>
        )}
        <Box sx={{ height: '100%', width: '100%', overflow: 'auto' }}>
          <Tapwrite
            content={description}
            getContent={handleDescriptionChange}
            placeholder="Add description.."
            editorClass="tapwrite-description-h-full"
            uploadFn={uploadFn}
            deleteEditorAttachments={(url) =>
              deleteEditorAttachmentsHandler(
                url,
                token ?? '',
                null,
                targetMethod == TargetMethod.POST ? null : targetTemplateId,
              )
            }
            attachmentLayout={(props) => <AttachmentLayout {...props} />}
            maxUploadLimit={MAX_UPLOAD_LIMIT}
            parentContainerStyle={{ gap: '0px', minHeight: '60px' }}
            dynamicFieldConfig={{
              fields: tapwriteDynamicFields,
              dropdownComponent: TapwriteDynamicFieldDropdown,
              templateComponent: TapwriteDynamicFieldTemplate,
            }}
          />
        </Box>
      </Stack>
      <Stack direction="column" rowGap={1} m="0px 0px">
        <Box sx={{ padding: 0.1 }}>
          <WorkflowStateSelector
            padding="4px 8px"
            gap="6px"
            option={workflowStates}
            value={statusValue}
            getValue={(value) => {
              updateStatusValue(value)
              store.dispatch(setCreateTemplateFields({ targetField: 'workflowStateId', value: value.id }))
            }}
          />
        </Box>
      </Stack>
    </>
  )
}

const NewTaskFooter = ({ handleCreate, targetMethod }: { handleCreate: () => void; targetMethod: TargetMethod }) => {
  const { taskName } = useSelector(selectCreateTemplate)
  const handleTemplateCreation = () => {
    const hasTitleError = !taskName.trim()
    if (hasTitleError) {
      store.dispatch(setErrors({ key: createTemplateErrors.TITLE, value: true }))
    } else {
      handleCreate()
    }
  }
  return (
    <Box sx={{ borderTop: (theme) => `1px solid ${theme.color.borders.border2}` }}>
      <AppMargin size={SizeofAppMargin.MEDIUM} py="16px">
        <Stack direction="row" justifyContent="right" alignItems="center">
          <Stack direction="row" columnGap={2}>
            <SecondaryBtn
              padding="3px 8px"
              handleClick={() => {
                store.dispatch(setShowTemplateModal({}))
                store.dispatch(clearTemplateFields())
              }}
              buttonContent={
                <Typography variant="sm" sx={{ color: (theme) => theme.color.gray[700] }}>
                  Cancel
                </Typography>
              }
            />
            <PrimaryBtn
              padding="3px 8px"
              handleClick={handleTemplateCreation}
              buttonText={targetMethod === TargetMethod.POST ? 'Create' : 'Save'}
            />
          </Stack>
        </Stack>
      </AppMargin>
    </Box>
  )
}

const NewTaskContainer = styled(Box)(({ theme }) => ({
  margin: '0 auto',
  background: '#ffffff',
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  boxShadow: '0px 16px 70px 0px rgba(0, 0, 0, 0.5)',
  border: `1px solid ${theme.color.borders.border2}`,
  borderRadius: '4px',
  width: '80%',
  maxWidth: '650px',
}))
