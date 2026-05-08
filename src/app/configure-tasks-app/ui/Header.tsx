'use client'
import { AppMargin, SizeofAppMargin } from '@/hoc/AppMargin'
import { Box, Stack } from '@mui/material'
import { PrimaryBtn } from '@/components/buttons/PrimaryBtn'
import { PlusIcon } from '@/icons'
import { StyledBox } from '@/app/detail/ui/styledComponent'
import store from '@/redux/store'
import { selectCreateTemplate, setShowTemplateModal } from '@/redux/features/templateSlice'
import { TargetMethod, UserType } from '@/types/interfaces'
import { useSelector } from 'react-redux'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { IconBtn } from '@/components/buttons/IconBtn'
import { Add } from '@mui/icons-material'
import { HeaderBreadcrumbs } from '@/components/layouts/HeaderBreadcrumbs'

export const ManageTemplateHeader = ({ token }: { token: string }) => {
  const { templates } = useSelector(selectCreateTemplate)
  const { previewMode } = useSelector(selectTaskBoard)
  return (
    <StyledBox>
      <AppMargin size={SizeofAppMargin.HEADER} py="14px">
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <HeaderBreadcrumbs
            items={[{ label: 'Manage templates' }]}
            token={token}
            // Treat user as IU since only they are allowed to manage templates for now
            userType={UserType.INTERNAL_USER}
          />
          {templates?.length ? (
            <>
              <Box
                sx={{
                  display: { xs: 'none', sm: 'block' },
                }}
              >
                <PrimaryBtn
                  handleClick={() => {
                    store.dispatch(setShowTemplateModal({ targetMethod: TargetMethod.POST }))
                  }}
                  buttonText="Create template"
                  startIcon={<PlusIcon />}
                />
              </Box>
              <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
                <IconBtn
                  handleClick={() => {
                    store.dispatch(setShowTemplateModal({ targetMethod: TargetMethod.POST }))
                  }}
                  icon={<Add sx={{ color: '#fff' }} />}
                  padding="4px"
                />
              </Box>
            </>
          ) : null}
        </Stack>
      </AppMargin>
    </StyledBox>
  )
}
