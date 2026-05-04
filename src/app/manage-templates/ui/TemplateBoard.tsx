'use client'
import { StyledModal } from '@/app/detail/ui/styledComponent'
import { ManageTemplateHeader } from '@/app/manage-templates/ui/Header'
import { TemplateCard } from '@/components/cards/TemplateCard'
import { CustomLink } from '@/hoc/CustomLink'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { clearTemplateFields, selectCreateTemplate, setShowTemplateModal } from '@/redux/features/templateSlice'
import store from '@/redux/store'
import { CreateTemplateRequest } from '@/types/dto/templates.dto'
import { TargetMethod } from '@/types/interfaces'
import { getLiveToken } from '@/utils/assemblyTokenStore'
import { getCardHrefTemplate } from '@/utils/getCardHref'
import { Box, Stack, Typography } from '@mui/material'
import { useSelector } from 'react-redux'
import { NoTemplateLayout } from './NoTemplateLayout'
import { TemplateForm } from './TemplateForm'
import { sortTemplatesByDescendingOrder } from '@/utils/sortByDescending'
import { useMemo } from 'react'

export const TemplateBoard = ({
  handleCreateTemplate,
  handleDeleteTemplate,
  handleEditTemplate,
}: {
  handleCreateTemplate: (payload: CreateTemplateRequest) => Promise<any>
  handleDeleteTemplate: (templateId: string) => void
  handleEditTemplate: (payload: CreateTemplateRequest, templateId: string) => void
}) => {
  const { targetTemplateId, targetMethod, templates, showTemplateModal, workflowStateId, taskName, description } =
    useSelector(selectCreateTemplate)

  const { previewMode } = useSelector(selectTaskBoard)
  const sortedTemplates = useMemo(() => sortTemplatesByDescendingOrder(templates), [templates])

  const showHeader = !!previewMode

  return (
    <>
      {showHeader && <ManageTemplateHeader />}

      {sortedTemplates.length ? (
        <Box id="templates-box" sx={{ maxWidth: '384px', marginTop: '32px', marginLeft: 'auto', marginRight: 'auto' }}>
          <Box
            sx={{
              width: { xs: '90%', sm: '100%' },
              margin: '0 auto',
            }}
          >
            <Typography variant="xl" lineHeight={'28px'}>
              Templates
            </Typography>
          </Box>

          <Stack
            direction="column"
            py="24px"
            sx={{
              width: { xs: '90%', sm: '100%' },
              margin: '0 auto',
            }}
            rowGap={4}
          >
            {sortedTemplates.map((template) => {
              return (
                <CustomLink
                  key={template.id}
                  href={{
                    pathname: getCardHrefTemplate(template),
                    query: { token: getLiveToken() },
                  }}
                  style={{ width: 'auto' }}
                >
                  <TemplateCard title={template.title} key={template.id} />
                </CustomLink>
              )
            })}
          </Stack>
        </Box>
      ) : (
        <NoTemplateLayout />
      )}

      <StyledModal
        open={showTemplateModal}
        onClose={() => {
          store.dispatch(setShowTemplateModal({}))
          store.dispatch(clearTemplateFields())
        }}
        aria-labelledby="create-task-modal"
        aria-describedby="add-new-task"
      >
        <TemplateForm
          handleCreate={async () => {
            store.dispatch(setShowTemplateModal({}))
            store.dispatch(clearTemplateFields())
            const temp = {
              title: taskName,
              workflowStateId: workflowStateId,
              body: description,
            }
            if (targetMethod === TargetMethod.POST) {
              await handleCreateTemplate(temp)
            } else {
              handleEditTemplate(temp, targetTemplateId)
            }
          }}
        />
      </StyledModal>
    </>
  )
}
