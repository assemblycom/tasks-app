'use client'

import DynamicFieldTitle from '@/components/atoms/DynamicFieldTitle'
import { SelectorType } from '@/components/inputs/Selector'
import { WorkflowStateSelector } from '@/components/inputs/Selector-WorkflowState'
import { CustomLink } from '@/hoc/CustomLink'
import { useHandleSelectorComponent } from '@/hooks/useHandleSelectorComponent'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { ITemplate, Sizes } from '@/types/interfaces'
import { getCardHrefTemplate } from '@/utils/getCardHref'
import { Stack } from '@mui/material'
import { useSelector } from 'react-redux'
import { editTemplate } from '@/app/manage-templates/actions'

interface SubtemplatesListProps {
  template: ITemplate
  workflowState?: WorkflowStateResponse
  isTemp?: boolean
}

export const SubtemplatesList = ({ template, workflowState, isTemp }: SubtemplatesListProps) => {
  const { workflowStates, token } = useSelector(selectTaskBoard)
  const { tokenPayload } = useSelector(selectAuthDetails)

  const { renderingItem: _statusValue, updateRenderingItem: updateStatusValue } = useHandleSelectorComponent({
    // item: selectedWorkflowState,
    item: workflowState ?? workflowStates.find((ws) => ws.id === template.workflowStateId),
    type: SelectorType.STATUS_SELECTOR,
  })
  const statusValue = _statusValue as WorkflowStateResponse

  return (
    <Stack
      tabIndex={0}
      direction="row"
      sx={{
        height: '36px',
        display: 'flex',
        padding: '6px 0px 6px 0px',
        alignItems: 'center',
        alignSelf: 'stretch',
        gap: '20px',
        justifyContent: 'flex-end',
        minWidth: 0,
        ':hover': {
          cursor: 'pointer',
          background: (theme) => theme.color.gray[100],
        },
        ':focus-visible': {
          outline: (theme) => `1px solid ${theme.color.borders.focusBorder2}`,
          outlineOffset: -1,
        },
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
            token && editTemplate(token, template.id, { workflowStateId: value.id })
          }}
          responsiveNoHide
          size={Sizes.MEDIUM}
          padding={'4px'}
          hoverColor={200}
        />
        {isTemp ? (
          <div
            key={template.id}
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
              <DynamicFieldTitle title={template.title} variant="subtasks" />
            </Stack>
          </div>
        ) : (
          <CustomLink
            key={template.id}
            href={{ pathname: getCardHrefTemplate(template), query: { token } }}
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
              <DynamicFieldTitle title={template.title} variant="subtasks" />
            </Stack>
          </CustomLink>
        )}
      </Stack>
    </Stack>
  )
}
