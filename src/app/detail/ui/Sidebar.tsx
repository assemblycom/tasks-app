'use client'

import { ClientDetailAppBridge } from '@/app/detail/ui/ClientDetailAppBridge'
import { StyledBox, StyledModal } from '@/app/detail/ui/styledComponent'
import { CopilotAvatar } from '@/components/atoms/CopilotAvatar'
import { SelectorButton } from '@/components/buttons/SelectorButton'
import { CopilotPopSelector } from '@/components/inputs/CopilotSelector'
import { DatePickerComponent } from '@/components/inputs/DatePickerComponent'
import { SelectorType } from '@/components/inputs/Selector'
import { WorkflowStateSelector } from '@/components/inputs/Selector-WorkflowState'
import { ConfirmUI } from '@/components/layouts/ConfirmUI'
import { AppMargin, SizeofAppMargin } from '@/hoc/AppMargin'
import { useHandleSelectorComponent } from '@/hooks/useHandleSelectorComponent'
import { useWindowWidth } from '@/hooks/useWindowWidth'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { selectTaskDetails, setShowSidebar, toggleShowConfirmAssignModal } from '@/redux/features/taskDetailsSlice'
import store from '@/redux/store'
import { DateStringSchema } from '@/types/date'
import { Associations, UpdateTaskRequest } from '@/types/dto/tasks.dto'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { FilterByOptions, IAssigneeCombined, InputValue, Sizes, UserType } from '@/types/interfaces'
import {
  getAssigneeId,
  getAssigneeName,
  getAssigneeValueFromAssociations,
  getUserIds,
  isEmptyAssignee,
  UserIdsType,
  UserIdsWithAssociationSharedType,
} from '@/utils/assignee'
import { createDateFromFormattedDateString, formatDate } from '@/utils/dateHelper'
import { NoAssignee } from '@/utils/noAssignee'
import { Box, Divider, Skeleton, Stack, styled, SxProps, Typography } from '@mui/material'
import {
  getSelectedUserIds,
  getSelectedViewerIds,
  getSelectorAssignee,
  getSelectorAssigneeFromTask,
  getSelectorAssociationFromTask,
} from '@/utils/selector'
import {
  shouldConfirmBeforeReassignment,
  shouldConfirmTaskSharedBeforeReassignment,
} from '@/utils/shouldConfirmBeforeReassign'
import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { z } from 'zod'
import { CopilotToggle } from '@/components/inputs/CopilotToggle'
import { SelectorFieldType } from '@/types/common'

type StyledTypographyProps = {
  display?: string
}

const StyledText = styled(Typography, {
  shouldForwardProp: (prop: string) => prop !== 'display', // don't pass to DOM
})<StyledTypographyProps>(({ theme, display }) => ({
  color: theme.color.gray[500],
  width: '80px',
  display,
}))

export const Sidebar = ({
  task_id,
  updateWorkflowState,
  updateAssignee,
  updateTask,
  disabled,
  workflowDisabled = false,
  userType,
  portalUrl,
}: {
  task_id: string
  selectedWorkflowState: WorkflowStateResponse
  selectedAssigneeId: string | undefined
  updateWorkflowState: (workflowState: WorkflowStateResponse) => void
  updateAssignee: (userIds: UserIdsWithAssociationSharedType) => void
  updateTask: (payload: UpdateTaskRequest) => void
  disabled: boolean
  workflowDisabled?: boolean
  userType: UserType
  portalUrl?: string
}) => {
  const { activeTask, workflowStates, assignee, previewMode } = useSelector(selectTaskBoard)
  const { showSidebar, showConfirmAssignModal, fromNotificationCenter } = useSelector(selectTaskDetails)
  const { tokenPayload } = useSelector(selectAuthDetails)

  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  const isAssignedToCU =
    userType == UserType.CLIENT_USER &&
    !previewMode &&
    (activeTask?.assigneeId === tokenPayload?.clientId || activeTask?.assigneeId === tokenPayload?.companyId)

  const [dueDate, setDueDate] = useState<Date | string | undefined>()
  const [showAssociationConfirmationModal, setAssociationConfirmationModal] = useState(false) //this is used only in sidebar.
  const [selectorFieldType, setSelectorFieldType] = useState<SelectorFieldType | null>(null)

  const [assigneeValue, setAssigneeValue] = useState<IAssigneeCombined | undefined>()
  const [selectedAssignee, setSelectedAssignee] = useState<UserIdsType | undefined>(undefined)

  const [taskAssociationValue, setTaskAssociationValue] = useState<IAssigneeCombined | null>(null)
  const [selectedAssociationUser, setSelectedAssociationUser] = useState<Associations | undefined>()

  const [isTaskShared, setIsTaskShared] = useState(false)

  const baseAssociationCondition = assigneeValue && assigneeValue.type === FilterByOptions.IUS
  const showShareToggle = baseAssociationCondition && taskAssociationValue
  const showAssociation = !assigneeValue || baseAssociationCondition

  const { renderingItem: _statusValue, updateRenderingItem: updateStatusValue } = useHandleSelectorComponent({
    // item: selectedWorkflowState,
    item: null,
    type: SelectorType.STATUS_SELECTOR,
  })

  const statusValue = _statusValue as WorkflowStateResponse //typecasting

  const completedWorkflowState = workflowStates.find((state) => state.type === 'completed')

  const isTaskCompleted = activeTask?.workflowStateId === completedWorkflowState?.id

  useEffect(() => {
    if (activeTask && workflowStates && updateStatusValue) {
      const currentTask = activeTask
      const currentWorkflowState = workflowStates.find((el) => el?.id === currentTask?.workflowStateId)
      updateStatusValue(currentWorkflowState)
      setDueDate(currentTask?.dueDate)
    }
  }, [activeTask, workflowStates, updateStatusValue])

  // effect depended on activeTask and assignee to update assigneeValue
  useEffect(() => {
    if (activeTask && assignee.length > 0) {
      const currentAssignee = getSelectorAssigneeFromTask(assignee, activeTask)
      setAssigneeValue(currentAssignee)
      const currentAssociations = getSelectorAssociationFromTask(assignee, activeTask) || null
      setTaskAssociationValue(currentAssociations)
      setIsTaskShared(!!activeTask.isShared)
    }
  }, [assignee, activeTask])

  const windowWidth = useWindowWidth()
  const isMobile = windowWidth < 800 && windowWidth !== 0

  const checkForAssociationAndShared = (userIds: UserIdsType): UserIdsWithAssociationSharedType => {
    const { internalUserId, clientId, companyId } = userIds

    if (internalUserId) return userIds

    const noAssignee = !internalUserId && !clientId && !companyId
    const temp: Partial<UserIdsWithAssociationSharedType> = {}

    if (isTaskShared) {
      temp.isShared = false
      setIsTaskShared(false)
    }

    if (!noAssignee) {
      temp.associations = [] // remove association only if assignee is non empty and not IU
      setTaskAssociationValue(null)
    }
    return { ...userIds, ...temp } // remove task shared if assignee is cleared or changed to client or company
  }

  const handleConfirmAssigneeChange = (userIds: UserIdsType) => {
    updateAssignee(checkForAssociationAndShared(userIds))
    setAssigneeValue(getAssigneeValue(userIds) as IAssigneeCombined)
    showConfirmAssignModal ? store.dispatch(toggleShowConfirmAssignModal()) : setAssociationConfirmationModal(false)
    setSelectorFieldType(null)
  }

  const handleConfirmAssociationChange = (userIds: UserIdsType) => {
    updateAssignee({
      internalUserId: assigneeValue?.id || null,
      clientId: null,
      companyId: null,
      isShared: false,
      associations: selectedAssociationUser,
    })
    setTaskAssociationValue(getAssigneeValue(userIds) as IAssigneeCombined)
    setIsTaskShared(false)
    setSelectorFieldType(null)
    setAssociationConfirmationModal(false)
  }

  useEffect(() => {
    if (isMobile) {
      store.dispatch(setShowSidebar(false))
    } else {
      store.dispatch(setShowSidebar(true))
    }
  }, [isMobile])

  const getAssigneeValue = (userIds?: UserIdsType) => {
    if (!userIds) {
      return NoAssignee
    }
    const assigneeId = getAssigneeId(userIds)
    const match = assignee.find((assignee) =>
      userIds.clientId ? assignee.id === assigneeId && assignee.companyId == userIds.companyId : assignee.id === assigneeId,
    )
    return match ?? undefined
  }

  if (!activeTask || !isHydrated) return <SidebarSkeleton />

  const handleAssigneeChange = (inputValue: InputValue[]) => {
    setSelectorFieldType(SelectorFieldType.ASSIGNEE)
    const newUserIds = getSelectedUserIds(inputValue)
    const previousAssignee = assignee.find((assignee) => assignee.id == getAssigneeId(getUserIds(activeTask)))
    const nextAssignee = getSelectorAssignee(assignee, inputValue)
    const shouldShowConfirmModal = shouldConfirmBeforeReassignment(previousAssignee, nextAssignee)
    const showAssociationConfirmModal = shouldConfirmTaskSharedBeforeReassignment(
      taskAssociationValue,
      isTaskShared,
      nextAssignee,
    )
    if (shouldShowConfirmModal) {
      setSelectedAssignee(newUserIds)
      store.dispatch(toggleShowConfirmAssignModal())
    } else if (showAssociationConfirmModal) {
      setSelectedAssignee(newUserIds)
      setAssociationConfirmationModal(true)
    } else {
      setAssigneeValue(getAssigneeValue(newUserIds) as IAssigneeCombined)
      updateAssignee(checkForAssociationAndShared(newUserIds))
      if (newUserIds.clientId || newUserIds.companyId) {
        setTaskAssociationValue(null)
      }
      setSelectorFieldType(null)
    }
  }

  const handleTaskAssociationChange = (inputValue: InputValue[]) => {
    setSelectorFieldType(SelectorFieldType.ASSOCIATION)
    const newTaskAssociationIds = getSelectedViewerIds(inputValue)
    const showModal = shouldConfirmTaskSharedBeforeReassignment(taskAssociationValue, isTaskShared)
    if (showModal) {
      setSelectedAssociationUser(newTaskAssociationIds)
      setAssociationConfirmationModal(true)
    } else if (newTaskAssociationIds) {
      setTaskAssociationValue(getSelectorAssignee(assignee, inputValue) || null)
      updateAssignee({
        internalUserId: assigneeValue ? assigneeValue.id : null,
        clientId: null,
        companyId: null,
        associations: newTaskAssociationIds,
        isShared: newTaskAssociationIds.length ? isTaskShared : false,
      })
      setSelectorFieldType(null)
    }
  }

  const handleTaskShared = () => {
    setIsTaskShared((prev) => !prev)

    updateAssignee({
      internalUserId: assigneeValue?.id || null,
      clientId: null,
      companyId: null,
      isShared: !isTaskShared,
    })
  }

  if (!showSidebar || fromNotificationCenter) {
    return (
      <Stack
        direction="row"
        columnGap={'8px'}
        rowGap={'8px'}
        position="relative"
        sx={{
          flexWrap: 'wrap',
          padding: '12px 18px',
          maxWidth: '654px',
          justifyContent: 'flex-start',
          alignItems: 'center',
          width: fromNotificationCenter ? '654px' : 'auto',
          margin: '0 auto',
          display: 'flex',
        }}
      >
        <Box
          sx={{
            borderRadius: '4px',
            width: 'fit-content',
          }}
        >
          <WorkflowStateSelector
            option={workflowStates}
            value={statusValue}
            getValue={(value) => {
              updateStatusValue(value)
              updateWorkflowState(value)
            }}
            responsiveNoHide
            disabled={workflowDisabled}
            size={Sizes.MEDIUM}
            padding={'3px 8px'}
          />
        </Box>
        <Box sx={{}}>
          <DatePickerComponent
            height={'30px'}
            getDate={(date) => {
              const isoDate = DateStringSchema.parse(formatDate(date))
              updateTask({
                dueDate: isoDate,
              })
            }}
            dateValue={dueDate ? createDateFromFormattedDateString(z.string().parse(dueDate)) : undefined}
            disabled={disabled && !previewMode}
            variant="button"
            size={Sizes.MEDIUM}
            padding={'3px 8px'}
          />
        </Box>
        <Box
          sx={{
            width: 'fit-content',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CopilotPopSelector
            name="Set assignee"
            onChange={handleAssigneeChange}
            disabled={disabled || fromNotificationCenter}
            initialValue={assigneeValue}
            buttonContent={
              <SelectorButton
                disabled={disabled || fromNotificationCenter}
                height={'30px'}
                startIcon={<CopilotAvatar size="xs" currentAssignee={assigneeValue} />}
                buttonContent={
                  <Typography
                    variant="md"
                    lineHeight="22px"
                    sx={{
                      color: (theme) => (assigneeValue ? theme.color.gray[600] : theme.color.gray[400]),
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      maxWidth: '135px',
                    }}
                  >
                    {assigneeValue?.name == 'No assignee' ? 'Set assignee' : getAssigneeName(assigneeValue, 'Set assignee')}
                  </Typography>
                }
              />
            }
          />
        </Box>
        {assigneeValue && assigneeValue.type === FilterByOptions.IUS && (
          <Box
            sx={{
              width: 'fit-content',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CopilotPopSelector
              hideIusList
              name="Set related to"
              onChange={handleTaskAssociationChange}
              disabled={(disabled && !previewMode) || fromNotificationCenter}
              initialValue={taskAssociationValue || undefined}
              buttonContent={
                <SelectorButton
                  disabled={(disabled && !previewMode) || fromNotificationCenter}
                  height={'30px'}
                  startIcon={<CopilotAvatar size="xs" currentAssignee={taskAssociationValue || undefined} />}
                  buttonContent={
                    <Typography
                      variant="md"
                      lineHeight="22px"
                      sx={{
                        color: (theme) => (taskAssociationValue ? theme.color.gray[600] : theme.color.gray[400]),
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        maxWidth: '135px',
                      }}
                    >
                      {getAssigneeName(taskAssociationValue || undefined, 'Set related to')}
                    </Typography>
                  }
                />
              }
            />
          </Box>
        )}
        <StyledModal
          open={showConfirmAssignModal || showAssociationConfirmationModal}
          onClose={() =>
            showConfirmAssignModal ? store.dispatch(toggleShowConfirmAssignModal()) : setAssociationConfirmationModal(false)
          }
          aria-labelledby="confirm-reassignment-modal"
          aria-describedby="confirm-reassignment"
        >
          <ConfirmUI
            handleCancel={() => {
              setSelectedAssignee(undefined)
              setSelectedAssociationUser(undefined)
              setSelectorFieldType(null)
              showConfirmAssignModal
                ? store.dispatch(toggleShowConfirmAssignModal())
                : setAssociationConfirmationModal(false)
            }}
            handleConfirm={() => {
              if (selectorFieldType === SelectorFieldType.ASSIGNEE && selectedAssignee) {
                handleConfirmAssigneeChange(selectedAssignee)
              } else if (selectorFieldType === SelectorFieldType.ASSOCIATION) {
                selectedAssociationUser &&
                  handleConfirmAssociationChange({
                    internalUserId: null,
                    clientId: selectedAssociationUser[0]?.clientId ?? null,
                    companyId: selectedAssociationUser[0]?.companyId ?? null,
                  })
              }
            }}
            buttonText={showAssociationConfirmationModal ? 'Remove' : 'Reassign'}
            description={
              showConfirmAssignModal ? (
                <>
                  You&apos;re about to reassign this task from{' '}
                  <strong>{getAssigneeName(getAssigneeValue(getUserIds(activeTask)))}</strong> to{' '}
                  <strong>{getAssigneeName(getAssigneeValue(selectedAssignee))}</strong>. This will give{' '}
                  <strong>{getAssigneeName(getAssigneeValue(selectedAssignee))}</strong> access to all task comments and
                  history.
                </>
              ) : (
                <>
                  The task will be stopped sharing with{' '}
                  <strong>{getAssigneeName(getAssigneeValueFromAssociations(taskAssociationValue, assignee))}</strong>
                </>
              )
            }
            title={
              showAssociationConfirmationModal && isEmptyAssignee(selectedAssignee) && selectorFieldType
                ? `Remove ${selectorFieldType}?`
                : 'Reassign task?'
            }
            variant={showAssociationConfirmationModal ? 'danger' : 'default'}
          />
        </StyledModal>
      </Stack>
    )
  }

  return (
    <Box
      sx={{
        borderLeft: (theme) => `1px solid ${theme.color.borders.border2}`,
        height: '100vh',
        display: showSidebar ? 'block' : 'none',
        width: isMobile && showSidebar ? '100vw' : '305px',
      }}
    >
      <StyledBox sx={{ borderBottom: '0px' }}>
        <AppMargin size={SizeofAppMargin.HEADER} py="24px 20px 12px">
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ height: '28px' }}>
            <Typography
              variant="sm"
              lineHeight={'24px'}
              fontSize={'16px'}
              fontWeight={500}
              color={(theme) => theme.color.text.text}
            >
              Properties
            </Typography>
          </Stack>
        </AppMargin>
      </StyledBox>

      <AppMargin size={SizeofAppMargin.HEADER} py={'0px'}>
        <Stack direction="row" alignItems="center" m="0px 0px 8px" columnGap="8px">
          <StyledText variant="md" minWidth="100px" fontWeight={400} lineHeight={'22px'}>
            Status
          </StyledText>
          {workflowStates.length > 0 && statusValue ? ( // show skelete if statusValue and workflow state list is empty
            <Box
              sx={{
                ':hover': {
                  bgcolor: (theme) => (!!workflowDisabled ? '' : theme.color.background.bgCallout),
                },
                borderRadius: '4px',
                width: 'fit-content',
              }}
            >
              <WorkflowStateSelector
                padding="0px"
                option={workflowStates}
                value={statusValue}
                getValue={(value) => {
                  updateStatusValue(value)
                  updateWorkflowState(value)
                }}
                disabled={workflowDisabled}
                variant={'normal'}
                gap="6px"
                responsiveNoHide
              />
            </Box>
          ) : (
            <SidebarElementSkeleton />
          )}
        </Stack>
        <Stack direction="row" m="8px 0px" alignItems="center" columnGap="8px" minWidth="fit-content">
          <StyledText variant="md" minWidth="100px" fontWeight={400} lineHeight={'22px'}>
            Due date
          </StyledText>
          <Box
            sx={{
              ':hover': {
                bgcolor: (theme) => (!!disabled && !previewMode ? '' : theme.color.background.bgCallout),
              },
              padding: '4px',
              borderRadius: '4px',
              width: 'fit-content',
            }}
          >
            <DatePickerComponent
              containerPadding="0px"
              getDate={(date) => {
                const isoDate = DateStringSchema.parse(formatDate(date))
                updateTask({
                  dueDate: isoDate,
                })
              }}
              dateValue={dueDate ? createDateFromFormattedDateString(z.string().parse(dueDate)) : undefined}
              disabled={disabled && !previewMode}
            />
          </Box>
        </Stack>
        <Stack direction="row" m="8px 0px" alignItems="center" columnGap="8px">
          <StyledText variant="md" minWidth="100px" fontWeight={400} lineHeight={'22px'}>
            Assignee
          </StyledText>
          {assignee.length > 0 ? ( // show skeleton if assignee list is empty
            <Box
              sx={{
                ':hover': {
                  bgcolor: (theme) => (disabled ? 'none' : theme.color.background.bgCallout),
                },
                padding: '4px',
                borderRadius: '4px',
                width: 'fit-content',
              }}
            >
              <CopilotPopSelector
                name="Set assignee"
                onChange={handleAssigneeChange}
                disabled={disabled || fromNotificationCenter}
                initialValue={assigneeValue}
                buttonContent={
                  <SelectorButton
                    disabled={disabled || fromNotificationCenter}
                    padding="0px"
                    startIcon={<CopilotAvatar size="xs" currentAssignee={assigneeValue} />}
                    outlined={true}
                    buttonContent={
                      <Typography
                        variant="md"
                        lineHeight="22px"
                        sx={{
                          color: (theme) => (assigneeValue ? theme.color.gray[600] : theme.color.gray[400]),
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          maxWidth: '135px',
                          fontWeight: 400,
                        }}
                      >
                        {assigneeValue?.name == 'No assignee'
                          ? 'Set assignee'
                          : getAssigneeName(assigneeValue, 'Set assignee')}
                      </Typography>
                    }
                  />
                }
              />
            </Box>
          ) : (
            <SidebarElementSkeleton />
          )}
        </Stack>

        {showAssociation && (
          <Stack direction="row" m="8px 0px 16px" alignItems="center" columnGap="8px">
            <StyledText variant="md" minWidth="100px" fontWeight={400} lineHeight={'22px'}>
              Related to
            </StyledText>
            {assignee.length > 0 ? ( // show skeleton if assignee list is empty
              <Box
                sx={{
                  ':hover': {
                    bgcolor: (theme) => (disabled && !previewMode ? 'none' : theme.color.background.bgCallout),
                  },
                  padding: '4px',
                  borderRadius: '4px',
                  width: 'fit-content',
                }}
              >
                <CopilotPopSelector
                  hideIusList
                  name="Set related to"
                  onChange={handleTaskAssociationChange}
                  disabled={(disabled && !previewMode) || fromNotificationCenter} // allow association change in preview mode
                  initialValue={taskAssociationValue || undefined}
                  buttonContent={
                    <SelectorButton
                      disabled={(disabled && !previewMode) || fromNotificationCenter}
                      padding="0px"
                      startIcon={<CopilotAvatar size="xs" currentAssignee={taskAssociationValue || undefined} />}
                      outlined={true}
                      buttonContent={
                        <Typography
                          variant="md"
                          lineHeight="22px"
                          sx={{
                            color: (theme) => (taskAssociationValue ? theme.color.gray[600] : theme.color.gray[400]),
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            maxWidth: '135px',
                            fontWeight: 400,
                          }}
                        >
                          {getAssigneeName(taskAssociationValue || undefined, 'Set related to')}
                        </Typography>
                      }
                    />
                  }
                />
              </Box>
            ) : (
              <SidebarElementSkeleton />
            )}
          </Stack>
        )}
        {showShareToggle && (
          <>
            <Divider sx={{ borderColor: (theme) => theme.color.borders.border, height: '1px' }} />
            <CopilotToggle
              label="Share with client"
              disabled={(disabled && !previewMode) || fromNotificationCenter} // allow task share in preview mode
              onChange={handleTaskShared}
              checked={isTaskShared}
              className="pt-4"
            />
          </>
        )}
      </AppMargin>
      <StyledModal
        open={showConfirmAssignModal || showAssociationConfirmationModal}
        onClose={() =>
          showConfirmAssignModal ? store.dispatch(toggleShowConfirmAssignModal()) : setAssociationConfirmationModal(false)
        }
        aria-labelledby="confirm-reassignment-modal"
        aria-describedby="confirm-reassignment"
      >
        <ConfirmUI
          handleCancel={() => {
            setSelectedAssignee(undefined)
            setSelectedAssociationUser(undefined)
            setSelectorFieldType(null)
            showConfirmAssignModal ? store.dispatch(toggleShowConfirmAssignModal()) : setAssociationConfirmationModal(false)
          }}
          handleConfirm={() => {
            if (selectorFieldType === SelectorFieldType.ASSOCIATION) {
              selectedAssociationUser &&
                handleConfirmAssociationChange({
                  internalUserId: null,
                  clientId: selectedAssociationUser[0]?.clientId ?? null,
                  companyId: selectedAssociationUser[0]?.companyId ?? null,
                })
            } else if (selectorFieldType === SelectorFieldType.ASSIGNEE && selectedAssignee) {
              handleConfirmAssigneeChange(selectedAssignee)
            }
          }}
          buttonText={showAssociationConfirmationModal ? 'Remove' : 'Reassign'}
          description={
            showConfirmAssignModal ? (
              <>
                You&apos;re about to reassign this task from{' '}
                <strong>{getAssigneeName(getAssigneeValue(getUserIds(activeTask)))}</strong> to{' '}
                <strong>{getAssigneeName(getAssigneeValue(selectedAssignee))}</strong>. This will give{' '}
                <strong>{getAssigneeName(getAssigneeValue(selectedAssignee))}</strong> access to all task comments and
                history.
              </>
            ) : (
              <>
                The task will be stopped sharing with{' '}
                <strong>{getAssigneeName(getAssigneeValueFromAssociations(taskAssociationValue, assignee))}</strong>.
              </>
            )
          }
          title={
            showAssociationConfirmationModal && selectorFieldType && isEmptyAssignee(selectedAssignee)
              ? `Remove ${selectorFieldType}?`
              : 'Reassign task?'
          }
          variant={showAssociationConfirmationModal ? 'danger' : 'default'}
        />
      </StyledModal>
      {isAssignedToCU && userType == UserType.CLIENT_USER && !previewMode && (
        <ClientDetailAppBridge
          isTaskCompleted={isTaskCompleted}
          handleTaskComplete={() => {
            completedWorkflowState && updateStatusValue(completedWorkflowState)
            completedWorkflowState && updateWorkflowState(completedWorkflowState)
          }}
          portalUrl={portalUrl}
        />
      )}
    </Box>
  )
}

export const SidebarSkeleton = () => {
  const { showSidebar } = useSelector(selectTaskDetails)
  const windowWidth = useWindowWidth()
  const isMobile = windowWidth < 800 && windowWidth !== 0

  useEffect(() => {
    if (isMobile) {
      store.dispatch(setShowSidebar(false))
    } else {
      store.dispatch(setShowSidebar(true))
    }
  }, [isMobile])

  if (isMobile) {
    return (
      <Stack
        direction="row"
        columnGap={'8px'}
        rowGap={'8px'}
        position="relative"
        sx={{ flexWrap: 'wrap', padding: '12px 18px' }}
      >
        <Box sx={{ height: '30px', alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
          <Skeleton variant="rectangular" width={140} height={15} />
        </Box>
        <Box sx={{ height: '30px', alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
          <Skeleton variant="rectangular" width={140} height={15} />
        </Box>

        <Box sx={{ height: '30px', alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
          <Skeleton variant="rectangular" width={140} height={15} />
        </Box>
      </Stack>
    )
  }
  return (
    <Box
      sx={{
        borderLeft: (theme) => `1px solid ${theme.color.borders.border2}`,
        height: '100vh',
        display: showSidebar ? 'block' : 'none',
        width: isMobile && showSidebar ? '100vw' : '305px',
      }}
    >
      <StyledBox sx={{ borderBottom: '0px' }}>
        <AppMargin size={SizeofAppMargin.HEADER} py="24px 20px 12px">
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ height: '28px' }}>
            <Typography
              variant="sm"
              lineHeight={'24px'}
              fontSize={'16px'}
              fontWeight={500}
              color={(theme) => theme.color.text.text}
            >
              Properties
            </Typography>
          </Stack>
        </AppMargin>
      </StyledBox>

      <AppMargin size={SizeofAppMargin.HEADER} py={'4px'}>
        <Stack direction="row" alignItems="center" m="4px 0px" columnGap="8px">
          <StyledText variant="md" minWidth="100px" fontWeight={400} lineHeight={'22px'}>
            Status
          </StyledText>
          <Box sx={{ height: '38px', alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
            <Skeleton variant="rectangular" width={120} height={15} />
          </Box>
        </Stack>
        <Stack direction="row" m="8x 0px" alignItems="center" columnGap="8px" minWidth="fit-content">
          <StyledText variant="md" minWidth="100px" fontWeight={400} lineHeight={'22px'}>
            Due date
          </StyledText>
          <Box sx={{ height: '40px', alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
            <Skeleton variant="rectangular" width={120} height={15} />
          </Box>
        </Stack>
        <Stack direction="row" m="8x 0px" alignItems="center" columnGap="8px" minWidth="fit-content">
          <StyledText variant="md" minWidth="100px" fontWeight={400} lineHeight={'22px'}>
            Assignee
          </StyledText>
          <Box sx={{ height: '40px', alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
            <Skeleton variant="rectangular" width={120} height={15} />
          </Box>
        </Stack>
      </AppMargin>
    </Box>
  )
}

export const SidebarElementSkeleton = () => {
  const windowWidth = useWindowWidth()
  const isMobile = windowWidth < 800 && windowWidth !== 0

  return (
    <Box
      sx={{
        height: `${isMobile ? '30px' : '38px'}`,
        alignItems: 'center',
        justifyContent: 'center',
        display: 'flex',
        width: 'fit-content',
      }}
    >
      <Skeleton variant="rectangular" width={`${isMobile ? '140px' : '120px'}`} height={15} />
    </Box>
  )
}
