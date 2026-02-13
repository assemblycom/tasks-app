import { UserRole } from '@/app/api/core/types/user'
import { PublicTaskCreateDto } from '@/app/api/tasks/public/public.dto'
import { CopilotAvatar } from '@/components/atoms/CopilotAvatar'
import AttachmentLayout from '@/components/AttachmentLayout'
import { GhostBtn } from '@/components/buttons/GhostBtn'
import { ManageTemplatesEndOption } from '@/components/buttons/ManageTemplatesEndOptions'
import { PrimaryBtn } from '@/components/buttons/PrimaryBtn'
import { SecondaryBtn } from '@/components/buttons/SecondaryBtn'
import { SelectorButton } from '@/components/buttons/SelectorButton'
import { StyledHelperText } from '@/components/error/FormHelperText'
import { CopilotPopSelector } from '@/components/inputs/CopilotSelector'
import { DatePickerComponent } from '@/components/inputs/DatePickerComponent'
import Selector, { SelectorType } from '@/components/inputs/Selector'
import { WorkflowStateSelector } from '@/components/inputs/Selector-WorkflowState'
import { CopilotToggle } from '@/components/inputs/CopilotToggle'
import { StyledTextField } from '@/components/inputs/TextField'
import { MAX_UPLOAD_LIMIT } from '@/constants/attachments'
import { AppMargin, SizeofAppMargin } from '@/hoc/AppMargin'
import { useHandleSelectorComponent } from '@/hooks/useHandleSelectorComponent'
import { CloseIcon, PersonIconSmall, TempalteIconMd } from '@/icons'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import {
  selectCreateTask,
  setAllCreateTaskFields,
  setAppliedDescription,
  setAppliedTitle,
  setCreateTaskFields,
  setErrors,
  setMultipleCreateTaskFields,
} from '@/redux/features/createTaskSlice'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { selectCreateTemplate } from '@/redux/features/templateSlice'
import store from '@/redux/store'
import { HomeParamActions } from '@/types/constants'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import {
  CreateTaskErrors,
  FilterByOptions,
  FilterOptions,
  FilterOptionsKeywords,
  IAssigneeCombined,
  InputValue,
  ITemplate,
  UserIds,
} from '@/types/interfaces'
import { checkEmptyAssignee, emptyAssignee, getAssigneeName } from '@/utils/assignee'
import { deleteEditorAttachmentsHandler, uploadAttachmentHandler } from '@/utils/attachmentUtils'
import { createUploadFn } from '@/utils/createUploadFn'
import { getAssigneeTypeCorrected } from '@/utils/getAssigneeTypeCorrected'
import {
  getSelectedUserIds,
  getSelectedViewerIds,
  getSelectorAssignee,
  getSelectorAssigneeFromFilterOptions,
} from '@/utils/selector'
import { trimAllTags } from '@/utils/trimTags'
import { Box, Stack, styled, Typography } from '@mui/material'
import { marked } from 'marked'
import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { Tapwrite } from 'tapwrite'

interface NewTaskFormInputsProps {
  isEditorReadonly?: boolean
}

interface NewTaskFormProps {
  handleCreate: () => void
  handleClose: () => void
  setIsEditorReadonly?: Dispatch<SetStateAction<boolean>>
}

type NewTaskFormHeaderProps = {
  handleClose: () => void
  setSubtasksCount: Dispatch<SetStateAction<number>>
  setIsEditorReadonly?: Dispatch<SetStateAction<boolean>>
}

export const NewTaskForm = ({ handleCreate, handleClose }: NewTaskFormProps) => {
  const { activeWorkflowStateId } = useSelector(selectCreateTask)
  const { workflowStates, assignee, previewMode, filterOptions, urlActionParams, token, previewClientCompany } =
    useSelector(selectTaskBoard)
  const [actionParamPayload, setActionParamPayload] = useState<PublicTaskCreateDto | null>(null)

  const todoWorkflowState = workflowStates.find((el) => el.key === 'todo') || workflowStates[0]
  const actionParamWorkflowState = actionParamPayload
    ? workflowStates.find((el) => el.key === actionParamPayload.status)
    : todoWorkflowState
  const defaultWorkflowState = activeWorkflowStateId
    ? workflowStates.find((state) => state.id === activeWorkflowStateId)
    : actionParamWorkflowState

  const { renderingItem: _statusValue, updateRenderingItem: updateStatusValue } = useHandleSelectorComponent({
    item: defaultWorkflowState,
    type: SelectorType.STATUS_SELECTOR,
  })

  const statusValue = _statusValue as WorkflowStateResponse //typecasting

  const [isEditorReadonly, setIsEditorReadonly] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [subtasksCount, setSubtasksCount] = useState<number>(0)

  const getDefaultAssigneeValue = () => {
    let assigneeFilterOptions = emptyAssignee
    if (!previewMode) {
      assigneeFilterOptions = filterOptions[FilterOptions.ASSIGNEE]
    } else if (filterOptions.type === FilterOptionsKeywords.CLIENTS) {
      assigneeFilterOptions = { internalUserId: null, ...previewClientCompany }
    }

    return getSelectorAssigneeFromFilterOptions(assignee, assigneeFilterOptions, filterOptions[FilterOptions.TYPE]) ?? null
  }

  const [assigneeValue, setAssigneeValue] = useState<IAssigneeCombined | null>(getDefaultAssigneeValue)
  const [taskAssociationsValue, setTaskAssociationsValue] = useState<IAssigneeCombined | null>(
    !!previewMode
      ? (getSelectorAssigneeFromFilterOptions(
          assignee,
          { internalUserId: null, ...previewClientCompany }, // if preview mode, default select the respective client/company as viewer
        ) ?? null)
      : null,
  )

  // this function handles the action param passed in the url and fill the values in the form
  const handleUrlActionParam = useCallback(async () => {
    if (urlActionParams.pf && token) {
      const payload = JSON.parse(decodeURIComponent(urlActionParams.pf))

      if (!payload.companyId && payload.clientId) {
        const assigneeVal = assignee.find((val) => val.id === payload.clientId)

        if (!assigneeVal) {
          setErrorMessage('Assignee not found')
          delete payload.clientId
        } else {
          if (Array.isArray(assigneeVal.companyIds) && assigneeVal.companyIds.length === 1) {
            payload.companyId = assigneeVal.companyIds[0]
          } else if (
            assigneeVal.companyId &&
            (!assigneeVal.companyIds || (Array.isArray(assigneeVal.companyIds) && !assigneeVal.companyIds.length))
          ) {
            payload.companyId = assigneeVal.companyId
          } else if (Array.isArray(assigneeVal?.companyIds)) {
            // If client has multiple companies, set error
            delete payload.clientId
            setErrorMessage('companyId must be provided for clients with more than one company')
          } else {
            delete payload.clientId
            setErrorMessage('companyId must be provided when clientId is provided')
          }
        }
      }

      // respect the filter Ids first. This is needed for CRM deep link for respective clients
      const assigneeFilter = {
        [UserIds.INTERNAL_USER_ID]: payload?.internalUserId || null,
        [UserIds.CLIENT_ID]: payload?.clientId || null,
        [UserIds.COMPANY_ID]: payload?.companyId || null,
      }

      const taskPayload = {
        title: payload?.name || '',
        description: marked(payload?.description?.replaceAll('\n', '<br>') || '', { async: false }),
        workflowStateId: workflowStates.find((state) => state.key === payload?.status)?.id || '',
        dueDate: payload?.dueDate || null,
        templateId: payload?.templateId || null,
        userIds: assigneeFilter,
        parentId: payload?.parentTaskId || null,
      }

      setAssigneeValue(getSelectorAssigneeFromFilterOptions(assignee, assigneeFilter) || null)
      setActionParamPayload(payload)
      store.dispatch(setAllCreateTaskFields(taskPayload))
    }
  }, [urlActionParams, assignee])

  useEffect(() => {
    if (!assignee.length) return
    if (
      Object.keys(urlActionParams).length > 0 &&
      urlActionParams.action === HomeParamActions.CREATE_TASK &&
      urlActionParams.oldPf !== urlActionParams.pf
    ) {
      // handle url action param for deep link
      handleUrlActionParam()
    } else {
      if (!!previewMode && filterOptions.type === FilterOptionsKeywords.CLIENTS) {
        // if preview mode, select the respective client/company as assignee when "client task" filter is selected
        store.dispatch(
          setCreateTaskFields({ targetField: 'userIds', value: { internalUserId: null, ...previewClientCompany } }),
        )
      } else if (!checkEmptyAssignee(filterOptions[FilterOptions.ASSIGNEE])) {
        store.dispatch(setCreateTaskFields({ targetField: 'userIds', value: filterOptions[FilterOptions.ASSIGNEE] }))
      } else if (filterOptions[FilterOptions.TYPE]) {
        // set default task associations when filter by type is applied on preview mode
        if (!!previewMode && taskAssociationsValue) {
          const correctedViewerObject = getAssigneeTypeCorrected(taskAssociationsValue)
          if (!correctedViewerObject) return

          store.dispatch(
            setCreateTaskFields({
              targetField: 'associations',
              value: getSelectedViewerIds([{ ...taskAssociationsValue, object: correctedViewerObject }]),
            }),
          )
        }

        if (!assigneeValue) return
        const correctedObject = getAssigneeTypeCorrected(assigneeValue)
        if (!correctedObject) return
        const newUserIds = getSelectedUserIds([{ ...assigneeValue, object: correctedObject }])
        store.dispatch(setCreateTaskFields({ targetField: 'userIds', value: newUserIds }))
      } else {
        store.dispatch(setCreateTaskFields({ targetField: 'userIds', value: emptyAssignee }))
      }
    }
  }, [assignee]) //if assigneeValue has an intial value before selection (when my tasks, filter by assignee filter is applied), then update the task creation field for userIds.

  const handleCreateWithAssignee = () => {
    handleCreate()
  }

  const handleClearSubTasks = () => {
    setSubtasksCount(0)
    store.dispatch(setCreateTaskFields({ targetField: 'disableSubtaskTemplates', value: true }))
  }

  useEffect(() => {
    function handleEscPress(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handleClose()
      }
    }
    document.addEventListener('keydown', handleEscPress)
    return () => {
      document.removeEventListener('keydown', handleEscPress)
    }
  }, [handleClose])

  const handleAssigneeChange = (inputValue: InputValue[]) => {
    // remove task viewers if assignee is cleared or changed to client or company
    if (inputValue.length === 0) {
      store.dispatch(setCreateTaskFields({ targetField: 'isShared', value: false }))
    }
    if (inputValue.length && inputValue[0].object !== UserRole.IU) {
      setTaskAssociationsValue(null)
      store.dispatch(
        setMultipleCreateTaskFields([
          { targetField: 'associations', value: [] },
          { targetField: 'isShared', value: false },
        ]),
      )
    }

    // if preview mode, auto-select current CU as viewer
    if (
      !!previewMode &&
      ((inputValue.length && inputValue[0].object === UserRole.IU) || !inputValue.length) &&
      previewClientCompany.companyId
    ) {
      if (!taskAssociationsValue)
        setTaskAssociationsValue(
          getSelectorAssigneeFromFilterOptions(
            assignee,
            { internalUserId: null, ...previewClientCompany }, // if preview mode, default select the respective client/company as viewer
          ) ?? null,
        )
      store.dispatch(
        setCreateTaskFields({
          targetField: 'associations',
          value: [{ clientId: previewClientCompany.clientId || undefined, companyId: previewClientCompany.companyId }],
        }),
      )
    }

    const newUserIds = getSelectedUserIds(inputValue)
    const selectedAssignee = getSelectorAssignee(assignee, inputValue)
    setAssigneeValue(selectedAssignee || null)
    store.dispatch(setCreateTaskFields({ targetField: 'userIds', value: newUserIds }))
  }

  // client association conditions
  const baseCondition = assigneeValue && assigneeValue.type === FilterByOptions.IUS
  const showSharedToggle = baseCondition && taskAssociationsValue
  const showAssociation = !assigneeValue || baseCondition

  return (
    <NewTaskContainer>
      <Stack
        sx={{
          border: (theme) => `1px solid ${theme.color.borders.borderDisabled}`,
        }}
      >
        <AppMargin size={SizeofAppMargin.MEDIUM} py="12px">
          <NewTaskHeader
            handleClose={handleClose}
            setIsEditorReadonly={setIsEditorReadonly}
            updateWorkflowStatusValue={updateStatusValue}
            setSubtasksCount={setSubtasksCount}
          />
        </AppMargin>
      </Stack>

      <AppMargin size={SizeofAppMargin.MEDIUM} py="20px">
        <NewTaskFormInputs isEditorReadonly={isEditorReadonly} />
        <Stack direction={'column'} rowGap={'12px'}>
          <Stack
            direction="row"
            gap={2}
            position="relative"
            sx={{
              flexWrap: 'wrap',
            }}
          >
            <Box sx={{ padding: 0.1 }}>
              <WorkflowStateSelector
                padding="4px 8px"
                gap="6px"
                option={workflowStates}
                value={statusValue}
                getValue={(value) => {
                  updateStatusValue(value)
                  store.dispatch(setCreateTaskFields({ targetField: 'workflowStateId', value: value.id }))
                }}
              />
            </Box>
            <Stack alignSelf="flex-start">
              <Box
                sx={{
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  maxWidth: { xs: '102px', sm: 'none' },
                }}
              >
                <DatePickerComponent
                  dateValue={actionParamPayload?.dueDate}
                  gap="6px"
                  padding="4px 8px"
                  getDate={(value) =>
                    store.dispatch(setCreateTaskFields({ targetField: 'dueDate', value: value as string }))
                  }
                  variant="button"
                />
              </Box>
            </Stack>

            <Stack alignSelf="flex-start">
              <CopilotPopSelector
                name="Set assignee"
                initialValue={assigneeValue || undefined}
                onChange={handleAssigneeChange}
                buttonContent={
                  <SelectorButton
                    startIcon={
                      assigneeValue ? <CopilotAvatar size="xs" currentAssignee={assigneeValue} /> : <PersonIconSmall />
                    }
                    height="30px"
                    padding="4px 8px"
                    buttonContent={
                      <Typography
                        variant="bodySm"
                        sx={{
                          color: (theme) => (assigneeValue ? theme.color.gray[600] : theme.color.text.textDisabled),
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          fontSize: '14px',
                          maxWidth: { xs: '60px', sm: '100px' },
                          lineHeight: '22px',
                        }}
                      >
                        {getAssigneeName(assigneeValue as IAssigneeCombined, 'Assignee')}
                      </Typography>
                    }
                  />
                }
              />
            </Stack>
            {showAssociation && (
              <Stack alignSelf="flex-start">
                <CopilotPopSelector
                  hideIusList
                  disabled={!!previewMode}
                  name="Set related to"
                  initialValue={taskAssociationsValue || undefined}
                  onChange={(inputValue) => {
                    const newUserIds = getSelectedViewerIds(inputValue)
                    const selectedTaskViewers = getSelectorAssignee(assignee, inputValue)
                    setTaskAssociationsValue(selectedTaskViewers || null)
                    store.dispatch(setCreateTaskFields({ targetField: 'associations', value: newUserIds }))
                  }}
                  buttonContent={
                    <SelectorButton
                      disabled={!!previewMode}
                      startIcon={
                        taskAssociationsValue ? (
                          <CopilotAvatar size="xs" currentAssignee={taskAssociationsValue} />
                        ) : (
                          <PersonIconSmall />
                        )
                      }
                      height="30px"
                      padding="4px 8px"
                      buttonContent={
                        <Typography
                          variant="bodySm"
                          sx={{
                            color: (theme) =>
                              taskAssociationsValue ? theme.color.gray[600] : theme.color.text.textDisabled,
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            fontSize: '14px',
                            maxWidth: { xs: '60px', sm: '100px' },
                          }}
                        >
                          {getAssigneeName(taskAssociationsValue as IAssigneeCombined, 'Related to')}
                        </Typography>
                      }
                    />
                  }
                />
              </Stack>
            )}
          </Stack>
          {showSharedToggle && (
            <Stack
              sx={{
                backgroundColor: (theme) => theme.color.background.bgCallout,
                borderRadius: '4px',
              }}
            >
              <CopilotToggle
                label="Share with client"
                onChange={() => {
                  const localSharedState = store.getState().createTask.isShared
                  store.dispatch(setCreateTaskFields({ targetField: 'isShared', value: !localSharedState }))
                }}
                checked={store.getState().createTask.isShared}
                className="p-1.5 py-2" // px-1.5 is not working
              />
            </Stack>
          )}
          {errorMessage && (
            <StyledHelperText sx={{ paddingTop: '6px', textAlign: 'left', marginLeft: '0px' }}>
              {errorMessage}
            </StyledHelperText>
          )}
          {!!subtasksCount && <SubtasksCard subtasksCount={subtasksCount} handleClearAll={handleClearSubTasks} />}
        </Stack>
      </AppMargin>

      <NewTaskFooter
        handleCreate={handleCreateWithAssignee}
        handleClose={handleClose}
        updateWorkflowStatusValue={updateStatusValue}
        creationDisabled={isEditorReadonly}
      />
    </NewTaskContainer>
  )
}

const NewTaskHeader = ({
  handleClose,
  setIsEditorReadonly,
  updateWorkflowStatusValue,
  setSubtasksCount,
}: NewTaskFormHeaderProps & { updateWorkflowStatusValue: (value: unknown) => void }) => {
  const [inputStatusValue, setInputStatusValue] = useState('')

  const { token, workflowStates } = useSelector(selectTaskBoard)
  const { templates } = useSelector(selectCreateTemplate)
  const { title, showModal, description, appliedDescription, appliedTitle } = useSelector(selectCreateTask)

  const { renderingItem: _templateValue, updateRenderingItem: updateTemplateValue } = useHandleSelectorComponent({
    item: undefined, //initially we don't want any value to be selected
    type: SelectorType.TEMPLATE_SELECTOR,
  })
  const templateValue = _templateValue as ITemplate //typecasting

  const applyTemplate = useCallback(
    (id: string, templateTitle: string, subTaskTemplates: ITemplate[]) => {
      const controller = new AbortController()

      const fetchTemplate = async () => {
        try {
          if (!showModal) {
            controller.abort()
            return
          }

          setIsEditorReadonly?.(true)

          store.dispatch(setAppliedTitle({ title: templateTitle }))
          if (appliedTitle == title.trim()) {
            store.dispatch(setCreateTaskFields({ targetField: 'title', value: templateTitle }))
          } else {
            store.dispatch(setCreateTaskFields({ targetField: 'title', value: title + ' ' + templateTitle }))
          }

          setSubtasksCount(subTaskTemplates.length ?? 0)

          const resp = await fetch(`/api/tasks/templates/${id}/apply?token=${token}`, {
            signal: controller.signal,
          })
          const { data: template } = await resp.json()
          if (!showModal) return

          setIsEditorReadonly?.(false)
          updateWorkflowStatusValue(workflowStates.find((state) => state.id === template.workflowStateId))
          store.dispatch(setCreateTaskFields({ targetField: 'workflowStateId', value: template.workflowStateId }))
          store.dispatch(setCreateTaskFields({ targetField: 'activeWorkflowStateId', value: template.workflowStateId }))
          store.dispatch(setAppliedDescription({ description: template.body }))
          store.dispatch(setCreateTaskFields({ targetField: 'templateId', value: id }))

          const trimmedAppliedDescription = appliedDescription && trimAllTags(appliedDescription)
          const trimmedDescription = trimAllTags(description)

          if (trimmedAppliedDescription == trimmedDescription || trimmedDescription === '<p></p>') {
            store.dispatch(setCreateTaskFields({ targetField: 'description', value: template.body }))
          } else {
            store.dispatch(setCreateTaskFields({ targetField: 'description', value: description + template.body }))
          }
          store.dispatch(setErrors({ key: CreateTaskErrors.TITLE, value: false }))
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
          }
        } finally {
          setIsEditorReadonly?.(false)
        }
      }
      fetchTemplate()
      return controller
    },
    [
      token,
      setIsEditorReadonly,
      workflowStates,
      title,
      description,
      appliedDescription,
      appliedTitle,
      showModal,
      updateWorkflowStatusValue,
    ],
  )

  const applyTemplateHandler = (newValue: ITemplate) => {
    if (!newValue || !token) return
    const controller = applyTemplate(newValue.id, newValue.title, newValue.subTaskTemplates)
    return () => {
      controller.abort()
    }
  }

  return (
    <>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" gap={'4px'}>
          <Typography variant="md" fontSize={'16px'} lineHeight={'24px'}>
            Create task
          </Typography>
          <Selector
            inputStatusValue={inputStatusValue}
            setInputStatusValue={setInputStatusValue}
            getSelectedValue={(_newValue) => {
              const newValue = _newValue as ITemplate
              updateTemplateValue(newValue)
              applyTemplateHandler(newValue)
            }}
            startIcon={<TempalteIconMd />}
            options={templates || []}
            placeholder="Search..."
            value={templateValue}
            selectorType={SelectorType.TEMPLATE_SELECTOR}
            endOption={<ManageTemplatesEndOption hasTemplates={!!templates?.length} />}
            endOptionHref={`/manage-templates?token=${token}`}
            listAutoHeightMax="147px"
            variant="normal"
            responsiveNoHide
            buttonWidth="auto"
            useClickHandler
            padding="5px"
            customDropdownWidth={400}
          />
        </Stack>
        <CloseIcon style={{ cursor: 'pointer' }} onClick={() => handleClose()} />
      </Stack>
    </>
  )
}

const NewTaskFormInputs = ({ isEditorReadonly }: NewTaskFormInputsProps) => {
  const { title, description } = useSelector(selectCreateTask)
  const { errors } = useSelector(selectCreateTask)
  const { token } = useSelector(selectTaskBoard)
  const { tokenPayload } = useSelector(selectAuthDetails)

  const handleDetailChange = (content: string) => {
    store.dispatch(setCreateTaskFields({ targetField: 'description', value: content }))
  }

  const uploadFn = createUploadFn({
    token,
    workspaceId: tokenPayload?.workspaceId,
  })

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
        <StyledTextField
          type="text"
          padding="8px 0px 0px"
          autoFocus={true}
          value={title}
          borderLess
          onChange={(e) => {
            store.dispatch(setCreateTaskFields({ targetField: 'title', value: e.target.value }))
            store.dispatch(setErrors({ key: CreateTaskErrors.TITLE, value: false }))
          }}
          error={errors.title}
          helperText={errors.title && 'Required'}
          inputProps={{
            maxLength: 255,
          }}
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
          multiline
          disabled={isEditorReadonly}
        />
        <Box sx={{ height: '100%', width: '100%', overflow: 'auto' }}>
          <Tapwrite
            content={description}
            getContent={handleDetailChange}
            placeholder="Add description..."
            editorClass="tapwrite-description-h-full"
            uploadFn={uploadFn}
            readonly={isEditorReadonly}
            deleteEditorAttachments={(url) => deleteEditorAttachmentsHandler(url, token ?? '', null, null)}
            attachmentLayout={(props) => <AttachmentLayout {...props} />}
            maxUploadLimit={MAX_UPLOAD_LIMIT}
            parentContainerStyle={{ gap: '0px', minHeight: '60px' }}
          />
        </Box>
      </Stack>
    </>
  )
}

const NewTaskFooter = ({
  handleCreate,
  handleClose,
  creationDisabled,
}: NewTaskFormProps & { updateWorkflowStatusValue: (value: unknown) => void; creationDisabled: boolean }) => {
  const { title } = useSelector(selectCreateTask)

  return (
    <Box sx={{ borderTop: (theme) => `1px solid ${theme.color.borders.border2}` }}>
      <AppMargin size={SizeofAppMargin.MEDIUM} py="16px">
        <Stack
          direction="row"
          justifyContent="flex-end"
          alignItems="center"
          sx={{
            marginLeft: 'auto',
          }}
        >
          <Stack direction="row" columnGap={2}>
            <SecondaryBtn
              padding="3px 8px"
              handleClick={() => handleClose()}
              buttonContent={
                <Typography variant="sm" sx={{ color: (theme) => theme.color.gray[700] }}>
                  Discard
                </Typography>
              }
            />
            <PrimaryBtn
              padding="3px 8px"
              disabled={!title.trim() || creationDisabled}
              handleClick={handleCreate}
              buttonText="Create"
            />
          </Stack>
        </Stack>
      </AppMargin>
    </Box>
  )
}

const SubtasksCard = ({ subtasksCount, handleClearAll }: { subtasksCount: number; handleClearAll: () => void }) => {
  return (
    <Stack
      alignItems="center"
      justifyContent="space-between"
      direction={'row'}
      display={'flex'}
      sx={{
        backgroundColor: (theme) => theme.color.gray[100],
        padding: '12px',
        alignSelf: 'stretch',
        borderRadius: '4px',
        border: (theme) => `1px solid ${theme.color.gray[150]}`,
        height: '46px',
      }}
    >
      <Stack direction={'row'} display={'flex'} alignItems={'center'} columnGap={'8px'} justifyContent={''}>
        <Typography variant="md" lineHeight={'22px'}>
          Subtasks
        </Typography>
        <Box
          display={'flex'}
          padding={'6px'}
          sx={{
            borderRadius: '4px',
            backgroundColor: (theme) => theme.color.gray[150],
            padding: '3px 6px',
            width: '19px',
            height: '18px',
            alignItems: 'center',
          }}
        >
          <Typography variant="xs">{subtasksCount} </Typography>
        </Box>
      </Stack>

      <GhostBtn handleClick={handleClearAll} buttonText="Clear all" typographyVariant="bodyMd" />
    </Stack>
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
  width: '95%',
  maxWidth: '650px',
}))
