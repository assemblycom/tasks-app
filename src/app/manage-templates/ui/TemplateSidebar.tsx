'use client'

import { SidebarElementSkeleton } from '@/app/detail/ui/Sidebar'
import { StyledBox } from '@/app/detail/ui/styledComponent'
import { SelectorType } from '@/components/inputs/Selector'
import { WorkflowStateSelector } from '@/components/inputs/Selector-WorkflowState'
import { AppMargin, SizeofAppMargin } from '@/hoc/AppMargin'
import { useHandleSelectorComponent } from '@/hooks/useHandleSelectorComponent'
import { useWindowWidth } from '@/hooks/useWindowWidth'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { selectTaskDetails, setShowSidebar } from '@/redux/features/taskDetailsSlice'
import { selectCreateTemplate } from '@/redux/features/templateSlice'
import store from '@/redux/store'
import { DYNAMIC_FIELDS, resolveDynamicField } from '@/utils/dynamicFields'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { Sizes } from '@/types/interfaces'
import { Box, Divider, Stack, Typography } from '@mui/material'
import { Icon } from 'copilot-design-system'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { useDynamicFieldInsert } from '@/context/hooks/useDynamicFieldInsert'

export const TemplateSidebar = ({
  template_id,
  updateWorkflowState,
}: {
  template_id: string
  updateWorkflowState: (workflowState: WorkflowStateResponse) => void
}) => {
  const dynamicFieldInsertCtx = useDynamicFieldInsert()
  const { workflowStates } = useSelector(selectTaskBoard)
  const { showSidebar } = useSelector(selectTaskDetails)
  const { activeTemplate } = useSelector(selectCreateTemplate)
  const { tokenPayload } = useSelector(selectAuthDetails)

  const { renderingItem: _statusValue, updateRenderingItem: updateStatusValue } = useHandleSelectorComponent({
    // item: selectedWorkflowState,
    item: null,
    type: SelectorType.STATUS_SELECTOR,
  })

  const statusValue = _statusValue as WorkflowStateResponse

  useEffect(() => {
    if (activeTemplate && workflowStates && updateStatusValue) {
      const currentTask = activeTemplate
      const currentWorkflowState = workflowStates.find((el) => el?.id === currentTask?.workflowStateId)
      updateStatusValue(currentWorkflowState)
    }
  }, [activeTemplate, workflowStates])

  const windowWidth = useWindowWidth()
  const isMobile = windowWidth < 800 && windowWidth !== 0
  useEffect(() => {
    if (isMobile) {
      store.dispatch(setShowSidebar(false))
    } else {
      store.dispatch(setShowSidebar(true))
    }
  }, [isMobile])

  if (!showSidebar) {
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
          width: 'auto',
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
            size={Sizes.MEDIUM}
            padding={'3px 8px'}
          />
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

      <AppMargin size={SizeofAppMargin.HEADER} py="0px 20px 20px">
        <Stack direction="row" alignItems="center" m="0px 0px" columnGap="8px">
          <Typography
            sx={{
              color: (theme) => theme.color.gray[500],
              width: '80px',
            }}
            variant="md"
            minWidth="100px"
            fontWeight={400}
            lineHeight={'22px'}
          >
            Status
          </Typography>

          {workflowStates.length > 0 && statusValue ? ( // show skelete if statusValue and workflow state list is empty
            <Box
              sx={{
                ':hover': {
                  bgcolor: (theme) => theme.color.background.bgCallout,
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
                variant={'normal'}
                gap="6px"
                responsiveNoHide
              />
            </Box>
          ) : (
            <SidebarElementSkeleton />
          )}
        </Stack>
      </AppMargin>

      <Divider />

      <AppMargin size={SizeofAppMargin.HEADER} py="0px 29px 0px">
        <Stack direction="column" m="16px 0px 8px" gap="20px">
          <Typography
            variant="sm"
            lineHeight={'24px'}
            fontSize={'16px'}
            fontWeight={500}
            color={(theme) => theme.color.text.text}
          >
            Dynamic Fields
          </Typography>
          <Stack direction="column" gap="12px">
            {DYNAMIC_FIELDS.map((field) => (
              <DynamicFieldCard
                key={field.key}
                label={`{{${field.label}}}`}
                preview={resolveDynamicField(field.key)}
                fieldKey={field.key}
                onClick={() => dynamicFieldInsertCtx?.insertField(field.key)}
              />
            ))}
          </Stack>
        </Stack>
      </AppMargin>
    </Box>
  )
}

const DynamicFieldCard = ({
  label,
  preview,
  fieldKey,
  onClick,
}: {
  label: string
  preview: string
  fieldKey: string
  onClick: () => void
}) => (
  <Box
    draggable
    onDragStart={(e) => {
      e.dataTransfer.setData('text/html', `<autofill-field data-value="${fieldKey}"></autofill-field>\u00A0`)
      e.dataTransfer.setData('application/x-dynamic-field', fieldKey)
      e.dataTransfer.effectAllowed = 'copy'
    }}
    onClick={onClick}
    sx={{
      border: (theme) => `1px solid ${theme.color.borders.border}`,
      borderRadius: '4px',
      padding: '6px 12px',
      '&:hover': {
        backgroundColor: (theme) => theme.color.gray[100],
      },
      cursor: 'pointer',
    }}
  >
    <Typography
      variant="bodySm"
      sx={{
        fontSize: '13px',
        lineHeight: '20px',
        fontWeight: 500,
        color: (theme) => theme.color.gray[600],
      }}
    >
      {label}
    </Typography>
    <Stack direction="row" alignItems="center" gap="6px" mt="4px">
      <Icon icon="Time" height={10} width={10} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
      <Typography
        variant="bodySm"
        sx={{
          fontSize: '12px',
          lineHeight: '20px',
          color: (theme) => theme.color.gray[400],
        }}
      >
        {preview}
      </Typography>
    </Stack>
  </Box>
)
