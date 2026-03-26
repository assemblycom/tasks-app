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
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { Sizes } from '@/types/interfaces'
import { Box, Stack, Typography } from '@mui/material'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'

export const TemplateSidebar = ({
  template_id,
  updateWorkflowState,
}: {
  template_id: string
  updateWorkflowState: (workflowState: WorkflowStateResponse) => void
}) => {
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

      <AppMargin size={SizeofAppMargin.HEADER} py={'0px'}>
        <Stack direction="row" alignItems="center" m="0px 0px 8px" columnGap="8px">
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
    </Box>
  )
}
