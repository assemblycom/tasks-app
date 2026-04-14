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
import { UpdateTaskRequest } from '@/types/dto/tasks.dto'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { FilterByOptions, IAssigneeCombined, InputValue, Sizes, UserType } from '@/types/interfaces'
import {
  getAssigneeId,
  getAssigneeName,
  getAssigneeValueFromViewers,
  getUserIds,
  isEmptyAssignee,
  UserIdsType,
  UserIdsWithViewersType,
} from '@/utils/assignee'
import { createDateFromFormattedDateString, formatDate } from '@/utils/dateHelper'
import { NoAssignee } from '@/utils/noAssignee'
import {
  getSelectedUserIds,
  getSelectedViewerIds,
  getSelectorAssignee,
  getSelectorAssigneeFromTask,
  getSelectorViewerFromTask,
} from '@/utils/selector'
import {
  shouldConfirmBeforeReassignment,
  shouldConfirmViewershipBeforeReassignment,
} from '@/utils/shouldConfirmBeforeReassign'
import { Box, Skeleton, Stack, styled, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { z } from 'zod'

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
}: {
  task_id: string
  selectedWorkflowState: WorkflowStateResponse
  selectedAssigneeId: string | undefined
  updateWorkflowState: (workflowState: WorkflowStateResponse) => void
  updateAssignee: (userIds: UserIdsWithViewersType) => void
  updateTask: (payload: UpdateTaskRequest) => void
  disabled: boolean
  workflowDisabled?: boolean
  userType: UserType
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
  const [showConfirmViewershipModal, setShowConfirmViewershipModal] = useState(false) //this is used only in sidebar.

  const [assigneeValue, setAssigneeValue] = useState<IAssigneeCombined | undefined>()
  const [selectedAssignee, setSelectedAssignee] = useState<UserIdsType | undefined>(undefined)

  const [taskViewerValue, setTaskViewerValue] = useState<IAssigneeCombined | null>(null)

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
      setTaskViewerValue(getSelectorViewerFromTask(assignee, activeTask) || null)
    }
  }, [assignee, activeTask])

  const windowWidth = useWindowWidth()
  const isMobile = windowWidth < 800 && windowWidth !== 0

  const checkViewersCompatibility = (userIds: UserIdsType): UserIdsWithViewersType => {
    // remove task viewers if assignee is cleared or changed to client or company
    if (!userIds.internalUserId) {
      setTaskViewerValue(null)
      return { ...userIds, viewers: [] } // remove viewers if assignee is cleared or changed to client or company
    }
    return userIds // no viewers change. keep viewers as is.
  }

  const handleConfirmAssigneeChange = (userIds: UserIdsType) => {
    updateAssignee(checkViewersCompatibility(userIds))
    setAssigneeValue(getAssigneeValue(userIds) as IAssigneeCombined)
    showConfirmAssignModal ? store.dispatch(toggleShowConfirmAssignModal()) : setShowConfirmViewershipModal(false)
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
    const newUserIds = getSelectedUserIds(inputValue)
    const previousAssignee = assignee.find((assignee) => assignee.id == getAssigneeId(getUserIds(activeTask)))
    const nextAssignee = getSelectorAssignee(assignee, inputValue)
    const shouldShowConfirmModal = shouldConfirmBeforeReassignment(previousAssignee, nextAssignee)
    const shouldShowConfirmViewershipModal = shouldConfirmViewershipBeforeReassignment(taskViewerValue, nextAssignee)
    if (shouldShowConfirmModal) {
      setSelectedAssignee(newUserIds)
      store.dispatch(toggleShowConfirmAssignModal())
    } else if (shouldShowConfirmViewershipModal) {
      setSelectedAssignee(newUserIds)
      setShowConfirmViewershipModal(true)
    } else {
      setAssigneeValue(getAssigneeValue(newUserIds) as IAssigneeCombined)
      updateAssignee(checkViewersCompatibility(newUserIds))
    }
  }

  const handleTaskViewerChange = (inputValue: InputValue[]) => {
    if (assigneeValue && assigneeValue.type === FilterByOptions.IUS) {
      const newTaskViewerIds = getSelectedViewerIds(inputValue)
      setTaskViewerValue(getSelectorAssignee(assignee, inputValue) || null)

      newTaskViewerIds &&
        updateAssignee({
          internalUserId: assigneeValue.id,
          clientId: null,
          companyId: null,
          viewers: newTaskViewerIds,
        })
    }
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
              name="Set client visibility"
              onChange={handleTaskViewerChange}
              disabled={(disabled && !previewMode) || fromNotificationCenter}
              initialValue={taskViewerValue || undefined}
              buttonContent={
                <SelectorButton
                  disabled={(disabled && !previewMode) || fromNotificationCenter}
                  height={'30px'}
                  startIcon={<CopilotAvatar size="xs" currentAssignee={taskViewerValue || undefined} />}
                  buttonContent={
                    <Typography
                      variant="md"
                      lineHeight="22px"
                      sx={{
                        color: (theme) => (taskViewerValue ? theme.color.gray[600] : theme.color.gray[400]),
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        maxWidth: '135px',
                      }}
                    >
                      {getAssigneeName(taskViewerValue || undefined, 'Set client visibility')}
                    </Typography>
                  }
                />
              }
            />
          </Box>
        )}
        <StyledModal
          open={showConfirmAssignModal || showConfirmViewershipModal}
          onClose={() =>
            showConfirmAssignModal ? store.dispatch(toggleShowConfirmAssignModal()) : setShowConfirmViewershipModal(false)
          }
          aria-labelledby="confirm-reassignment-modal"
          aria-describedby="confirm-reassignment"
        >
          <ConfirmUI
            handleCancel={() => {
              setSelectedAssignee(undefined)
              showConfirmAssignModal ? store.dispatch(toggleShowConfirmAssignModal()) : setShowConfirmViewershipModal(false)
            }}
            handleConfirm={() => {
              if (selectedAssignee) {
                handleConfirmAssigneeChange(selectedAssignee)
              }
            }}
            buttonText={showConfirmViewershipModal ? 'Remove' : 'Reassign'}
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
                  <strong>{getAssigneeName(getAssigneeValueFromViewers(taskViewerValue, assignee))}</strong> will also lose
                  visibility to the task.
                </>
              )
            }
            title={showConfirmViewershipModal && isEmptyAssignee(selectedAssignee) ? 'Remove assignee?' : 'Reassign task?'}
            variant={showConfirmViewershipModal ? 'danger' : 'default'}
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

        {assigneeValue && assigneeValue.type === FilterByOptions.IUS && (
          <Stack direction="row" m="8px 0px" alignItems="center" columnGap="8px">
            <StyledText variant="md" minWidth="100px" fontWeight={400} lineHeight={'22px'}>
              Client visibility
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
                  name="Set client visibility"
                  onChange={handleTaskViewerChange}
                  disabled={(disabled && !previewMode) || fromNotificationCenter} // allow visibility change in preview mode
                  initialValue={taskViewerValue || undefined}
                  buttonContent={
                    <SelectorButton
                      disabled={(disabled && !previewMode) || fromNotificationCenter}
                      padding="0px"
                      startIcon={<CopilotAvatar size="xs" currentAssignee={taskViewerValue || undefined} />}
                      outlined={true}
                      buttonContent={
                        <Typography
                          variant="md"
                          lineHeight="22px"
                          sx={{
                            color: (theme) => (taskViewerValue ? theme.color.gray[600] : theme.color.gray[400]),
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            maxWidth: '135px',
                            fontWeight: 400,
                          }}
                        >
                          {getAssigneeName(taskViewerValue || undefined, 'Set client visibility')}
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
      </AppMargin>
      <StyledModal
        open={showConfirmAssignModal || showConfirmViewershipModal}
        onClose={() =>
          showConfirmAssignModal ? store.dispatch(toggleShowConfirmAssignModal()) : setShowConfirmViewershipModal(false)
        }
        aria-labelledby="confirm-reassignment-modal"
        aria-describedby="confirm-reassignment"
      >
        <ConfirmUI
          handleCancel={() => {
            setSelectedAssignee(undefined)
            showConfirmAssignModal ? store.dispatch(toggleShowConfirmAssignModal()) : setShowConfirmViewershipModal(false)
          }}
          handleConfirm={() => {
            if (selectedAssignee) {
              handleConfirmAssigneeChange(selectedAssignee)
            }
          }}
          buttonText={showConfirmViewershipModal ? 'Remove' : 'Reassign'}
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
                <strong>{getAssigneeName(getAssigneeValueFromViewers(taskViewerValue, assignee))}</strong> will also lose
                visibility to the task.
              </>
            )
          }
          title={showConfirmViewershipModal && isEmptyAssignee(selectedAssignee) ? 'Remove assignee?' : 'Reassign task?'}
          variant={showConfirmViewershipModal ? 'danger' : 'default'}
        />
      </StyledModal>
      {isAssignedToCU && userType == UserType.CLIENT_USER && !previewMode && (
        <ClientDetailAppBridge
          isTaskCompleted={isTaskCompleted}
          handleTaskComplete={() => {
            completedWorkflowState && updateStatusValue(completedWorkflowState)
            completedWorkflowState && updateWorkflowState(completedWorkflowState)
          }}
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
