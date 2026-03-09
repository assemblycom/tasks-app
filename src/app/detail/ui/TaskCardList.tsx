'use client'

import { updateTask } from '@/app/(home)/actions'
import { UserRole } from '@/app/api/core/types/user'
import { clientUpdateTask, updateAssignee, updateTaskDetail } from '@/app/detail/[task_id]/[user_type]/actions'
import { StyledModal } from '@/app/detail/ui/styledComponent'
import { CopilotAvatar } from '@/components/atoms/CopilotAvatar'
import { TaskMetaItems } from '@/components/atoms/TaskMetaItems'
import TaskTitle from '@/components/atoms/TaskTitle'
import { CopilotPopSelector } from '@/components/inputs/CopilotSelector'
import { DatePickerComponent } from '@/components/inputs/DatePickerComponent'
import { SelectorType } from '@/components/inputs/Selector'
import { WorkflowStateSelector } from '@/components/inputs/Selector-WorkflowState'
import { ConfirmUI } from '@/components/layouts/ConfirmUI'
import { CustomLink } from '@/hoc/CustomLink'
import { useHandleSelectorComponent } from '@/hooks/useHandleSelectorComponent'
import { useSubtaskCount } from '@/hooks/useSubtaskCount'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import {
  selectTaskBoard,
  setAssigneeCache,
  setConfirmAssigneeModalId,
  setConfirmAssociationModalId,
  updateWorkflowStateIdByTaskId,
} from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { DateStringSchema } from '@/types/date'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { IAssigneeCombined, InputValue, Sizes } from '@/types/interfaces'
import {
  getAssigneeId,
  getAssigneeName,
  getAssigneeValueFromAssociations,
  getUserIds,
  isEmptyAssignee,
  UserIdsType,
} from '@/utils/assignee'
import { createDateFromFormattedDateString, formatDate } from '@/utils/dateHelper'
import { getCardHref } from '@/utils/getCardHref'
import { isTaskCompleted } from '@/utils/isTaskCompleted'
import { NoAssignee } from '@/utils/noAssignee'
import {
  getSelectedUserIds,
  getSelectorAssignee,
  getSelectorAssigneeFromTask,
  getSelectorAssociationFromTask,
} from '@/utils/selector'
import {
  shouldConfirmBeforeReassignment,
  shouldConfirmTaskSharedBeforeReassignment,
} from '@/utils/shouldConfirmBeforeReassign'
import { checkIfTaskViewer } from '@/utils/taskViewer'

import { Box, Skeleton, Stack, SxProps, Theme } from '@mui/material'
import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { z } from 'zod'

interface TaskCardListProps {
  task: TaskResponse
  variant: 'task' | 'subtask' | 'subtask-board' //task variant is used in task board list view, subtask variant is used for sub task list in details page aud subtask-board variant is used for sub task list in board page
  workflowState?: WorkflowStateResponse
  mode: UserRole
  assignee?: IAssigneeCombined
  handleUpdate?: (taskId: string, changes: Partial<TaskResponse>, updater: () => Promise<void>) => Promise<void>
  isTemp?: boolean
  sx?: SxProps<Theme> | undefined
  disableNavigation?: boolean
}

export const TaskCardList = ({
  task,
  variant,
  workflowState,
  mode,
  handleUpdate,
  isTemp,
  sx,
  disableNavigation = false,
}: TaskCardListProps) => {
  const { assignee, workflowStates, previewMode, token, confirmAssignModalId, assigneeCache, confirmAssociationModalId } =
    useSelector(selectTaskBoard)
  const { tokenPayload } = useSelector(selectAuthDetails)

  const [currentDueDate, setCurrentDueDate] = useState<string | undefined>(task.dueDate)
  const [selectedAssignee, setSelectedAssignee] = useState<UserIdsType | undefined>(undefined)

  const subtaskCount = useSubtaskCount(task.id)

  const [assigneeValue, setAssigneeValue] = useState<IAssigneeCombined | Omit<IAssigneeCombined, 'type'> | undefined>(() => {
    return assigneeCache[task.id]
  }) //Omitting type for NoAssignee

  useEffect(() => {
    if (!task) return

    if (assignee.length > 0) {
      const currentAssignee = getSelectorAssigneeFromTask(assignee, task)
      const finalAssignee = currentAssignee ?? NoAssignee
      store.dispatch(setAssigneeCache({ key: task.id, value: finalAssignee }))
      setAssigneeValue(finalAssignee)
    }
  }, [assignee, task.id, task.assigneeId, task])

  useEffect(() => {
    setCurrentDueDate(task.dueDate)
  }, [task.dueDate])

  const { renderingItem: _statusValue, updateRenderingItem: updateStatusValue } = useHandleSelectorComponent({
    // item: selectedWorkflowState,
    item: workflowState ?? task.workflowState ?? workflowStates.find((ws) => ws.id === task.workflowStateId),
    type: SelectorType.STATUS_SELECTOR,
  })

  const statusValue = _statusValue as WorkflowStateResponse

  const handleConfirmAssigneeChange = (userIds: UserIdsType) => {
    const { internalUserId, clientId, companyId } = userIds
    const isAssigneeClient = !!(clientId || companyId)
    const hasNoAssignee = !internalUserId && !isAssigneeClient
    const associations = isAssigneeClient ? [] : undefined
    const isShared = hasNoAssignee || isAssigneeClient ? false : undefined
    store.dispatch(setConfirmAssigneeModalId(undefined))
    store.dispatch(setConfirmAssociationModalId(undefined))
    if (handleUpdate) {
      token &&
        handleUpdate(task.id, { internalUserId, clientId, companyId }, () =>
          updateAssignee(token, task.id, internalUserId, clientId, companyId, associations, isShared),
        )
    } else {
      token && updateAssignee(token, task.id, internalUserId, clientId, companyId, associations, isShared)
    }
  }

  const handleAssigneeChange = (inputValue: InputValue[]) => {
    const newUserIds = getSelectedUserIds(inputValue)
    const previousAssignee = assignee.find((assignee) => assignee.id == getAssigneeId(getUserIds(task)))
    const nextAssignee = getSelectorAssignee(assignee, inputValue)
    const shouldShowConfirmModal = shouldConfirmBeforeReassignment(previousAssignee, nextAssignee)
    const showAssociationConfirmModal = shouldConfirmTaskSharedBeforeReassignment(
      getSelectorAssociationFromTask(assignee, task) ?? null,
      !!task.isShared,
      nextAssignee,
    )
    if (shouldShowConfirmModal) {
      setSelectedAssignee(newUserIds)
      store.dispatch(setConfirmAssigneeModalId(task.id))
    } else if (showAssociationConfirmModal) {
      setSelectedAssignee(newUserIds)
      store.dispatch(setConfirmAssociationModalId(task.id))
    } else {
      const { internalUserId, clientId, companyId } = newUserIds
      const isAssigneeClient = !!(clientId || companyId)
      const hasNoAssignee = !internalUserId && !isAssigneeClient
      const associations = isAssigneeClient ? [] : undefined
      const isShared = hasNoAssignee || isAssigneeClient ? false : undefined
      if (handleUpdate) {
        token &&
          handleUpdate(task.id, { assigneeId: nextAssignee?.id }, () =>
            updateAssignee(token, task.id, internalUserId, clientId, companyId, associations, isShared),
          )
      } else {
        token && updateAssignee(token, task.id, internalUserId, clientId, companyId, associations, isShared)
      }
      setAssigneeValue(nextAssignee ?? NoAssignee)
    }
  }

  const getAssigneeValue = (userIds?: UserIdsType) => {
    if (!userIds) {
      return NoAssignee
    }
    const assigneeId = getAssigneeId(userIds)
    const match = assignee.find((assignee) => assignee.id === assigneeId)
    return match ?? NoAssignee
  }

  return (
    <Stack
      tabIndex={0}
      direction="row"
      sx={{
        height: variant == 'task' ? '44px' : '36px',
        display: 'flex',
        padding: variant == 'task' ? { xs: '10px 20px 10px 20px' } : '6px 0px 6px 0px',
        alignItems: 'center',
        alignSelf: 'stretch',
        gap: '20px',
        justifyContent: 'flex-end',
        minWidth: 0,
        ':hover': {
          cursor: disableNavigation ? 'auto' : 'pointer',
          background: (theme) =>
            disableNavigation
              ? theme.color.base.white
              : variant == 'subtask-board'
                ? theme.color.gray[150]
                : theme.color.gray[100],
        },
        ':focus-visible': {
          outline: (theme) => `1px solid ${theme.color.borders.focusBorder2}`,
          outlineOffset: -1,
        },
        ...sx, //option to override the fixed styles
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        sx={{
          display: 'flex',
          gap: '2px',
          minWidth: 0,
          flexGrow: 1,
          flexShrink: 1,
        }}
      >
        <WorkflowStateSelector
          option={workflowStates}
          value={statusValue}
          variant="icon"
          getValue={(value) => {
            updateStatusValue(value)
            if (variant === 'task') {
              store.dispatch(updateWorkflowStateIdByTaskId({ taskId: task.id, targetWorkflowStateId: value.id }))
            }
            if (mode === UserRole.Client && !previewMode) {
              clientUpdateTask(z.string().parse(token), task.id, value.id)
            } else {
              updateTask({
                token: z.string().parse(token),
                taskId: task.id,
                payload: { workflowStateId: value.id },
              })
            }
          }}
          responsiveNoHide
          size={Sizes.MEDIUM}
          padding={'4px'}
          hoverColor={200}
          disabled={checkIfTaskViewer(task.associations, tokenPayload)}
        />

        {isTemp || variant === 'subtask-board' || disableNavigation ? (
          <div
            key={task.id}
            style={{
              display: 'flex',
              gap: '2px',
              minWidth: 0,
              flexGrow: 1,
              flexShrink: 1,
              width: '100%',
            }}
          >
            <Stack
              direction="row"
              sx={{
                gap: '8px',
                display: 'flex',
                alignItems: 'center',
                marginRight: 'auto',
                minWidth: 0,
                flexGrow: 1,
                flexShrink: 1,
              }}
            >
              <TaskTitle variant={variant == 'task' ? 'list' : 'subtasks'} title={task.title} />

              {(task.subtaskCount > 0 || task.isArchived) && (
                <Stack direction="row" sx={{ display: 'flex', gap: '12px', flexShrink: 0, alignItems: 'center' }}>
                  <TaskMetaItems task={task} lineHeight="21px" />
                </Stack>
              )}
            </Stack>
          </div>
        ) : (
          <CustomLink
            key={task.id}
            href={{ pathname: getCardHref(task, mode), query: { token } }}
            style={{
              display: 'flex',
              gap: '2px',
              minWidth: 0,
              flexShrink: 1,
              width: '100%',
            }}
          >
            <Stack
              direction="row"
              sx={{
                gap: '8px',
                display: 'flex',
                alignItems: 'center',
                minWidth: 0,
                flexShrink: 1,
              }}
            >
              <TaskTitle variant={variant == 'task' ? 'list' : 'subtasks'} title={task.title} />
              {(task.subtaskCount > 0 || task.isArchived) && (
                <Stack direction="row" sx={{ display: 'flex', gap: '12px', flexShrink: 0, alignItems: 'center' }}>
                  <TaskMetaItems task={task} lineHeight="21px" />
                </Stack>
              )}
            </Stack>
          </CustomLink>
        )}
      </Stack>

      <Stack
        direction="row"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginLeft: 'auto',
          justifyContent: 'flex-end',
        }}
      >
        {task.dueDate && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
            <DatePickerComponent
              getDate={(date) => {
                const isoDate = DateStringSchema.parse(formatDate(date))
                if (handleUpdate) {
                  token &&
                    handleUpdate(task.id, { dueDate: isoDate }, () =>
                      updateTaskDetail({ token, taskId: task.id, payload: { dueDate: isoDate } }),
                    )
                } else {
                  token && updateTaskDetail({ token, taskId: task.id, payload: { dueDate: isoDate } })
                }
                setCurrentDueDate(isoDate)
              }}
              variant="icon"
              padding="2px 4px"
              dateValue={currentDueDate ? createDateFromFormattedDateString(z.string().parse(currentDueDate)) : undefined}
              disabled={mode === UserRole.Client && !previewMode}
              isDone={isTaskCompleted(task, workflowStates)}
              isShort
              hoverColor={200}
              tooltipProps={{
                disabled: mode === UserRole.Client && !previewMode,
              }}
            />
          </Box>
        )}
        {assigneeValue ? (
          <CopilotPopSelector
            name="Set assignee"
            disabled={mode === UserRole.Client && !previewMode}
            initialValue={(() => {
              const value = assigneeValue as IAssigneeCombined
              if (!value || value === NoAssignee) return undefined
              return value
            })()}
            onChange={handleAssigneeChange}
            variant="icon"
            tooltipProps={{
              content: assigneeValue === NoAssignee ? 'Set assignee' : getAssigneeName(assigneeValue),

              disabled: mode === UserRole.Client && !previewMode,
            }}
            buttonContent={
              <Box
                sx={{
                  padding: '2px 2px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: '4px',
                  ...(!(mode === UserRole.Client && !previewMode) && {
                    ':hover': {
                      cursor: 'pointer',
                      background: (theme) => theme.color.gray[variant === 'subtask-board' ? 200 : 150],
                    },
                  }),
                }}
              >
                <CopilotAvatar size="xs" currentAssignee={assigneeValue as IAssigneeCombined} />
              </Box>
            }
          />
        ) : (
          <Box
            sx={{
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px',
              ...(!(mode === UserRole.Client && !previewMode) && {
                ':hover': {
                  cursor: 'pointer',
                  background: (theme) => theme.color.gray[150],
                },
              }),
            }}
          >
            <Skeleton variant="circular" width={20} height={20} />
          </Box>
        )}
      </Stack>
      <StyledModal
        open={confirmAssignModalId === task.id || confirmAssociationModalId === task.id}
        onClose={(e: React.MouseEvent) => {
          e.stopPropagation()
          store.dispatch(setConfirmAssigneeModalId(undefined))
          store.dispatch(setConfirmAssociationModalId(undefined))
        }}
        aria-labelledby="confirm-reassignment-modal"
        aria-describedby="confirm-reassignment"
      >
        <ConfirmUI
          handleCancel={() => {
            setSelectedAssignee(undefined)
            store.dispatch(setConfirmAssigneeModalId(undefined))
            store.dispatch(setConfirmAssociationModalId(undefined))
          }}
          handleConfirm={() => {
            if (selectedAssignee) {
              handleConfirmAssigneeChange(selectedAssignee)
            }
          }}
          buttonText={confirmAssociationModalId === task.id ? 'Remove' : 'Reassign'}
          description={
            confirmAssignModalId === task.id ? (
              <>
                You&apos;re about to reassign this task from{' '}
                <strong>{getAssigneeName(getAssigneeValue(getUserIds(task)))}</strong> to{' '}
                <strong>{getAssigneeName(getAssigneeValue(selectedAssignee))}</strong>. This will give{' '}
                <strong>{getAssigneeName(getAssigneeValue(selectedAssignee))}</strong> access to all task comments and
                history.
              </>
            ) : (
              <>
                The task will be stopped sharing with{' '}
                <strong>
                  {getAssigneeName(
                    getAssigneeValueFromAssociations(getSelectorAssociationFromTask(assignee, task) ?? null, assignee),
                  )}
                </strong>
              </>
            )
          }
          title={
            confirmAssociationModalId === task.id && isEmptyAssignee(selectedAssignee)
              ? 'Remove assignee?'
              : 'Reassign task?'
          }
          variant={confirmAssociationModalId === task.id ? 'danger' : 'default'}
        />
      </StyledModal>
    </Stack>
  )
}
