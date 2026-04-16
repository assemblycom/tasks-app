import { ViewerRemovedResponse, ViewerRemovedSchema } from '@/app/api/activity-logs/schemas/ViewerSchema'
import { DotSeparator } from '@/app/detail/ui/DotSeparator'
import { BoldTypography, StyledTypography, TypographyContainer, VerticalLine } from '@/app/detail/ui/styledComponent'
import { CopilotAvatar } from '@/components/atoms/CopilotAvatar'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { TruncateMaxNumber } from '@/types/constants'
import { getAssigneeName } from '@/utils/assignee'
import { DueDateFormatter } from '@/utils/dueDateFormatter'
import { getTimeDifference } from '@/utils/getTimeDifference'
import { truncateText } from '@/utils/truncateText'
import { ArchivedStateUpdatedSchema } from '@api/activity-logs/schemas/ArchiveStateUpdatedSchema'
import { DueDateChangedSchema } from '@api/activity-logs/schemas/DueDateChangedSchema'
import { LogResponse } from '@api/activity-logs/schemas/LogResponseSchema'
import { TaskAssignedResponse, TaskAssignedResponseSchema } from '@api/activity-logs/schemas/TaskAssignedSchema'
import { TitleUpdatedSchema } from '@api/activity-logs/schemas/TitleUpdatedSchema'
import { WorkflowStateUpdatedSchema } from '@api/activity-logs/schemas/WorkflowStateUpdatedSchema'
import { Stack, Typography } from '@mui/material'
import { ActivityType } from '@prisma/client'
import { useCallback, useMemo } from 'react'
import { useSelector } from 'react-redux'

interface Prop {
  log: LogResponse
}

export const ActivityLog = ({ log }: Prop) => {
  const { assignee, workflowStates } = useSelector(selectTaskBoard)

  const getAssignedToName = useCallback(
    (details: TaskAssignedResponse) => {
      const assignedTo = assignee.find((el) => el.id === details.newValue)
      const assignedFrom = assignee.find((el) => el.id === details.oldValue)
      return [getAssigneeName(assignedFrom, ''), getAssigneeName(assignedTo, 'Deleted User')]
    },
    [assignee],
  )

  const getViewerName = useCallback(
    (details: ViewerRemovedResponse) => {
      const viewer = assignee.find((el) => el.id === details.oldValue)
      return getAssigneeName(viewer, 'Deleted User')
    },
    [assignee],
  )

  const getLogEntities = useCallback(
    (type: ActivityType) => {
      switch (type) {
        case ActivityType.WORKFLOW_STATE_UPDATED:
          const { oldValue, newValue } = WorkflowStateUpdatedSchema.parse(log.details)
          const getWorkflowStateName = (id: string) => workflowStates.find((state) => state.id === id)?.name || 'Deleted'
          return [getWorkflowStateName(oldValue), getWorkflowStateName(newValue)]

        case ActivityType.TASK_ASSIGNED:
        case ActivityType.VIEWER_ADDED:
          const taskAssignees = TaskAssignedResponseSchema.parse(log.details)
          return getAssignedToName(taskAssignees)

        case ActivityType.VIEWER_REMOVED:
          const taskViewer = ViewerRemovedSchema.parse(log.details)
          return [getViewerName(taskViewer)]

        case ActivityType.TITLE_UPDATED:
          const titles = TitleUpdatedSchema.parse(log.details)
          return [titles.oldValue, titles.newValue]

        case ActivityType.ARCHIVE_STATE_UPDATED:
          const archivedStates = ArchivedStateUpdatedSchema.parse(log.details)
          return [archivedStates.newValue ? 'archived' : 'unarchived']

        case ActivityType.DUE_DATE_CHANGED:
          const dueDates = DueDateChangedSchema.parse(log.details)
          return [dueDates.oldValue ?? '', dueDates.newValue ?? '']

        default:
          return []
      }
    },
    [assignee, workflowStates, getAssignedToName],
  )

  const logEntities = useMemo(() => {
    return getLogEntities(log.type)
  }, [log.type, assignee, workflowStates])

  const activityDescription: { [key in ActivityType]: (...args: string[]) => React.ReactNode } = {
    [ActivityType.TASK_CREATED]: () => (
      <>
        <StyledTypography> created task</StyledTypography>
        <DotSeparator />
      </>
    ),
    [ActivityType.TASK_ASSIGNED]: (from: string, to: string) => (
      <>
        <StyledTypography>
          {from ? 're' : ''}assigned task {from && `from `}
        </StyledTypography>
        {from && <BoldTypography>{from}</BoldTypography>}
        <StyledTypography> to </StyledTypography>
        <BoldTypography>{to}</BoldTypography>
        <DotSeparator />
      </>
    ),
    [ActivityType.TASK_UNASSIGNED]: () => (
      <>
        <StyledTypography>removed assignee</StyledTypography>
        <DotSeparator />
      </>
    ),

    [ActivityType.TITLE_UPDATED]: (_from: string, to: string) => (
      <>
        <StyledTypography> changed title to </StyledTypography>
        <BoldTypography>{truncateText(to, TruncateMaxNumber.ACTIVITY_LOG_TITLE_UPDATED)}</BoldTypography>
        <DotSeparator />
      </>
    ),
    [ActivityType.WORKFLOW_STATE_UPDATED]: (from: string, to: string) => (
      <>
        <StyledTypography> changed status from </StyledTypography>
        <BoldTypography>{from}</BoldTypography>
        <StyledTypography> to </StyledTypography>
        <BoldTypography>{to}</BoldTypography>
        <DotSeparator />
      </>
    ),
    [ActivityType.DUE_DATE_CHANGED]: (from: string, to: string) => (
      <>
        <StyledTypography> changed due date </StyledTypography>
        {from && (
          <>
            <StyledTypography> from </StyledTypography> <BoldTypography> {DueDateFormatter(from)}</BoldTypography>
          </>
        )}
        <StyledTypography> to</StyledTypography>
        {to ? <BoldTypography> {DueDateFormatter(to)}</BoldTypography> : <StyledTypography> none</StyledTypography>}
        <DotSeparator />
      </>
    ),
    [ActivityType.ARCHIVE_STATE_UPDATED]: (archivedStatus: string) => (
      <>
        <StyledTypography> {archivedStatus} task</StyledTypography>
        <DotSeparator />
      </>
    ),
    [ActivityType.COMMENT_ADDED]: () => null,
    [ActivityType.VIEWER_ADDED]: (_from: string, to: string) => (
      <>
        <StyledTypography> shared the task with </StyledTypography>
        <BoldTypography>{to}</BoldTypography>
        <DotSeparator />
      </>
    ),
    [ActivityType.VIEWER_REMOVED]: (from: string) => (
      <>
        <StyledTypography> stopped sharing the task with </StyledTypography>
        <BoldTypography>{from}</BoldTypography>
        <DotSeparator />
      </>
    ),
  }

  const activityUser = assignee.find((assignee) => assignee.id == log.userId)

  return (
    <Stack direction="row" columnGap={4} position="relative">
      <VerticalLine />

      <Stack direction="row" columnGap={4} padding={'11px 0px 11px 0px'} width={'100%'} sx={{ alignItems: 'center' }}>
        <CopilotAvatar size="xs" currentAssignee={activityUser} />
        <TypographyContainer direction="row" columnGap={1}>
          {activityUser ? (
            <BoldTypography>{getAssigneeName(activityUser, '')}</BoldTypography>
          ) : (
            <Typography variant="md" sx={{ fontStyle: 'italic' }}>
              Deleted User
            </Typography>
          )}{' '}
          {activityDescription[log.type as ActivityType](...logEntities)}{' '}
          <StyledTypography> {getTimeDifference(log.createdAt)}</StyledTypography>
        </TypographyContainer>
      </Stack>
    </Stack>
  )
}
