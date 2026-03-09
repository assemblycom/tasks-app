'use client'

import { UserRole } from '@/app/api/core/types/user'
import { CopilotAvatar } from '@/components/atoms/CopilotAvatar'
import { SelectorType } from '@/components/inputs/Selector'
import { WorkflowStateSelector } from '@/components/inputs/Selector-WorkflowState'
import { useHandleSelectorComponent } from '@/hooks/useHandleSelectorComponent'
import { useSubtaskCount } from '@/hooks/useSubtaskCount'
import {
  selectTaskBoard,
  setAssigneeCache,
  setConfirmAssigneeModalId,
  setConfirmAssociationModalId,
  updateWorkflowStateIdByTaskId,
} from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
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
import { isTaskCompleted } from '@/utils/isTaskCompleted'
import { NoAssignee } from '@/utils/noAssignee'
import { Box, Skeleton, Stack, styled } from '@mui/material'
import React, { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { UrlObject } from 'url'

import { updateTask } from '@/app/(home)/actions'
import { clientUpdateTask, updateAssignee, updateTaskDetail } from '@/app/detail/[task_id]/[user_type]/actions'
import { TaskCardList } from '@/app/detail/ui/TaskCardList'
import { TaskMetaItems } from '@/components/atoms/TaskMetaItems'
import TaskTitle from '@/components/atoms/TaskTitle'
import { CopilotPopSelector } from '@/components/inputs/CopilotSelector'
import { DatePickerComponent } from '@/components/inputs/DatePickerComponent'
import { CustomLink } from '@/hoc/CustomLink'
import { DateStringSchema } from '@/types/date'
import { createDateFromFormattedDateString, formatDate } from '@/utils/dateHelper'
import { getCardHref } from '@/utils/getCardHref'
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
import z from 'zod'
import { StyledModal } from '@/app/detail/ui/styledComponent'
import { ConfirmUI } from '@/components/layouts/ConfirmUI'
import { useRouter } from 'next/navigation'

const TaskCardContainer = styled(Stack)(({ theme }) => ({
  border: `1px solid ${theme.color.borders.border}`,
  borderRadius: theme.spacing(theme.shape.radius100),
  background: theme.color.base.white,
  padding: '12px',
  overflowWrap: 'break-word',
  userSelect: 'none',
  ':hover': {
    background: theme.color.gray[100],
  },
  ':focus-visible': {
    borderColor: theme.color.borders.focusBorder2,
    borderRadius: theme.spacing(theme.shape.radius100),
    outline: 'none',
  },
  cursor: 'pointer',
  width: '336px',
}))

interface TaskCardProps {
  task: TaskResponse
  href: string | UrlObject
  mode: UserRole
  workflowState?: WorkflowStateResponse
  subtasks?: TaskResponse[]
  workflowDisabled?: boolean
}

export const TaskCard = ({ task, href, workflowState, mode, subtasks, workflowDisabled = false }: TaskCardProps) => {
  const {
    assignee,
    workflowStates,
    assigneeCache,
    previewMode,
    token,
    accessibleTasks,
    showSubtasks,
    confirmAssignModalId,
    confirmAssociationModalId,
  } = useSelector(selectTaskBoard)

  const subtaskCount = useSubtaskCount(task.id)

  const [currentDueDate, setCurrentDueDate] = useState<string | undefined>(task.dueDate)

  const [selectedAssignee, setSelectedAssignee] = useState<UserIdsType | undefined>(undefined)
  const router = useRouter()

  const [assigneeValue, setAssigneeValue] = useState<IAssigneeCombined | Omit<IAssigneeCombined, 'type'> | undefined>(() => {
    return assigneeCache[task.id]
  }) //Omitting type for NoAssignee

  const { renderingItem: _statusValue, updateRenderingItem: updateStatusValue } = useHandleSelectorComponent({
    // item: selectedWorkflowState,
    item: workflowState ?? task.workflowState,
    type: SelectorType.STATUS_SELECTOR,
  })

  const statusValue = _statusValue as WorkflowStateResponse

  useEffect(() => {
    if (assignee.length > 0) {
      const currentAssignee = getSelectorAssigneeFromTask(assignee, task)
      const finalAssignee = currentAssignee ?? NoAssignee
      store.dispatch(setAssigneeCache({ key: task.id, value: finalAssignee }))
      setAssigneeValue(finalAssignee)
    }
  }, [assignee, task.id, task.assigneeId])

  useEffect(() => {
    setCurrentDueDate(task.dueDate)
  }, [task.dueDate])

  const handleConfirmAssigneeChange = (userIds: UserIdsType) => {
    const isAssigneeClient = !!(userIds.clientId || userIds.companyId)
    const hasNoAssignee = !userIds.internalUserId && !isAssigneeClient
    const associations = isAssigneeClient ? [] : undefined
    const isShared = hasNoAssignee || isAssigneeClient ? false : undefined
    const { internalUserId, clientId, companyId } = userIds
    store.dispatch(setConfirmAssigneeModalId(undefined))
    store.dispatch(setConfirmAssociationModalId(undefined))
    token && updateAssignee(token, task.id, internalUserId, clientId, companyId, associations, isShared)
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
      token && updateAssignee(token, task.id, internalUserId, clientId, companyId, associations, isShared)
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
    <TaskCardContainer tabIndex={0}>
      <Stack direction="column" rowGap={'12px'}>
        <Stack direction={'row'} columnGap={'2px'}>
          <Box sx={{ alignItems: 'top' }}>
            <WorkflowStateSelector
              option={workflowStates}
              value={statusValue}
              variant="icon"
              getValue={(value) => {
                updateStatusValue(value)
                store.dispatch(updateWorkflowStateIdByTaskId({ taskId: task.id, targetWorkflowStateId: value.id }))
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
              disabled={workflowDisabled}
            />
          </Box>
          <Stack direction="column" justifyContent="center" rowGap={'5px'} sx={{ width: '100%' }}>
            <Stack direction={'row'} columnGap={'10px'} justifyContent={'space-between'}>
              <TaskTitle title={task.title ?? ''} variant="board" />

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
                  tooltipProps={{
                    content: assigneeValue === NoAssignee ? 'Set assignee' : getAssigneeName(assigneeValue),
                    disabled: mode === UserRole.Client && !previewMode,
                  }}
                  variant="icon"
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
                            background: (theme) => theme.color.gray[150],
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
            <Stack direction={'row'} columnGap={'10px'} justifyContent={'space-between'}>
              <Box sx={{ ml: '-4px' }}>
                {task.dueDate && (
                  <DatePickerComponent
                    getDate={(date) => {
                      const isoDate = DateStringSchema.parse(formatDate(date))
                      token && updateTaskDetail({ token, taskId: task.id, payload: { dueDate: isoDate } })
                      setCurrentDueDate(isoDate)
                    }}
                    variant="icon"
                    padding="0px 4px"
                    dateValue={
                      currentDueDate ? createDateFromFormattedDateString(z.string().parse(currentDueDate)) : undefined
                    }
                    disabled={mode === UserRole.Client && !previewMode}
                    isDone={isTaskCompleted(task, workflowStates)}
                    isShort
                    tooltipProps={{
                      disabled: mode === UserRole.Client && !previewMode,
                    }}
                  />
                )}
              </Box>

              {(task.isArchived || subtaskCount > 0) && (
                <Stack
                  direction="row"
                  sx={{
                    display: 'flex',
                    gap: '12px',
                    flexShrink: 0,
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    padding: '0px 5px',
                  }}
                >
                  <TaskMetaItems task={task} lineHeight="18px" />
                </Stack>
              )}
            </Stack>
          </Stack>
        </Stack>
        {showSubtasks && subtasks && subtasks.length > 0 && (
          <Stack direction="column">
            {subtasks.map((subtask) => {
              const href = `${getCardHref(subtask, mode)}/?token=${token}`
              return (
                <Box
                  key={subtask.id}
                  sx={{
                    marginLeft: '-12px',
                    marginRight: '-12px',
                    paddingLeft: '32px',
                    paddingRight: '12px',
                    ':hover': {
                      background: (theme) => theme.color.gray[150],
                    },
                  }}
                  onMouseEnter={(e) => {
                    e.preventDefault()
                    router.prefetch(href)
                  }}
                  onClick={(e) => {
                    e.preventDefault()
                    router.push(href)
                  }} //removed customLink and applied manual prefetch for now. todo: prevent nested Links in TaskCard.
                >
                  <TaskCardList task={subtask} variant="subtask-board" mode={mode} />
                </Box>
              )
            })}
          </Stack>
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
    </TaskCardContainer>
  )
}
