'use client'
import { StyledModal } from '@/app/detail/ui/styledComponent'
import { ManageTemplateHeader } from '@/app/configure-tasks-app/ui/Header'
import { TemplateCard } from '@/components/cards/TemplateCard'
import { CustomLink } from '@/hoc/CustomLink'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { clearTemplateFields, selectCreateTemplate, setShowTemplateModal } from '@/redux/features/templateSlice'
import store from '@/redux/store'
import { CreateTemplateRequest } from '@/types/dto/templates.dto'
import { TargetMethod } from '@/types/interfaces'
import { getCardHrefTemplate } from '@/utils/getCardHref'
import { Box, Stack, Typography } from '@mui/material'
import { useSelector } from 'react-redux'
import { TemplateForm } from './TemplateForm'
import { sortTemplatesByDescendingOrder } from '@/utils/sortByDescending'
import { useMemo } from 'react'
import { GhostBtn } from '@/components/buttons/GhostBtn'
import { GrayAddMediumIcon } from '@/icons'

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

  const { token, previewMode } = useSelector(selectTaskBoard)
  const sortedTemplates = useMemo(() => sortTemplatesByDescendingOrder(templates), [templates])

  const showHeader = token && !!previewMode

  return (
    <>
      {showHeader && <ManageTemplateHeader token={token} />}

      <Box id="templates-box" sx={{ width: '100%', maxWidth: '640px', margin: '0 auto', px: { xs: 2, sm: 0 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: '12px' }}>
          <Typography variant="lg">Templates</Typography>
          <GhostBtn
            buttonText="Add template"
            handleClick={() => store.dispatch(setShowTemplateModal({ targetMethod: TargetMethod.POST }))}
            startIcon={<GrayAddMediumIcon />}
            typographyVariant="bodyMd"
          />
        </Stack>

        {sortedTemplates.length ? (
          <Stack direction="column" rowGap={2}>
            {sortedTemplates.map((template) => {
              return (
                <CustomLink
                  key={template.id}
                  href={{
                    pathname: getCardHrefTemplate(template),
                    query: { token },
                  }}
                  style={{ width: 'auto' }}
                >
                  <TemplateCard title={template.title} key={template.id} />
                </CustomLink>
              )
            })}
          </Stack>
        ) : (
          <Typography variant="bodySm" sx={{ color: (theme) => theme.color.gray[500] }}>
            No templates yet. Create one to get started.
          </Typography>
        )}
      </Box>

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
