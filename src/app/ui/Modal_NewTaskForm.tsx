'use client'

import { StyledModal } from '@/app/detail/ui/styledComponent'
import {
  clearCreateTaskFields,
  selectCreateTask,
  setActiveWorkflowStateId,
  setShowModal,
} from '@/redux/features/createTaskSlice'
import { selectTaskBoard, setUrlActionParams } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { HomeParamActions } from '@/types/constants'
import { CreateAttachmentRequest } from '@/types/dto/attachments.dto'
import { CreateTaskRequestSchema } from '@/types/dto/tasks.dto'
import { FilterOptions } from '@/types/interfaces'
import { checkEmptyAssignee } from '@/utils/assignee'
import dayjs from 'dayjs'
import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import { handleCreate } from '../(home)/actions'
import { NewTaskForm } from './NewTaskForm'

export const ModalNewTaskForm = ({
  handleCreateMultipleAttachments,
}: {
  handleCreateMultipleAttachments: (attachments: CreateAttachmentRequest[]) => Promise<void>
}) => {
  const { token, filterOptions, urlActionParams } = useSelector(selectTaskBoard)
  const {
    title,
    description,
    workflowStateId,
    userIds,
    dueDate,
    showModal,
    templateId,
    parentId,
    associations,
    isShared,
    disableSubtaskTemplates,
  } = useSelector(selectCreateTask)

  const handleModalClose = async (isKeyboard: boolean = false) => {
    if (isKeyboard && document.querySelector('.tippy-box')) {
      return
    }
    store.dispatch(setShowModal())
    store.dispatch(clearCreateTaskFields({ isFilterOn: !checkEmptyAssignee(filterOptions[FilterOptions.ASSIGNEE]) }))
    store.dispatch(setActiveWorkflowStateId(null))
    store.dispatch(setUrlActionParams({ oldPf: urlActionParams.pf }))
    // NOTE: Reimplement in M3
    // await bulkRemoveAttachments(attachments)
  }

  useEffect(() => {
    if (
      Object.keys(urlActionParams).length > 0 &&
      urlActionParams.action === HomeParamActions.CREATE_TASK &&
      urlActionParams.pf !== urlActionParams.oldPf
    ) {
      store.dispatch(setShowModal())
    }
  }, [urlActionParams])

  return (
    <StyledModal
      open={showModal}
      onClose={() => handleModalClose(true)}
      aria-labelledby="create-task-modal"
      aria-describedby="add-new-task"
      sx={{
        '& > .MuiBackdrop-root': {
          backgroundColor: 'rgba(15,15,15,0.6)',
        },
      }}
    >
      <NewTaskForm
        handleCreate={async () => {
          if (!title.trim()) return

          store.dispatch(setShowModal())
          const formattedDueDate = dueDate && dayjs(new Date(dueDate)).format('YYYY-MM-DD')
          const payload = {
            title,
            body: description,
            workflowStateId,
            ...userIds,
            dueDate: formattedDueDate,
            templateId,
            ...(associations && associations.length > 0 && { associations }),
            isShared,
            parentId,
          }

          const isSubTaskDisabled = disableSubtaskTemplates
          store.dispatch(clearCreateTaskFields({ isFilterOn: !checkEmptyAssignee(filterOptions[FilterOptions.ASSIGNEE]) }))
          await handleCreate(token as string, CreateTaskRequestSchema.parse(payload), {
            disableSubtaskTemplates: isSubTaskDisabled,
          })
        }}
        handleClose={handleModalClose}
      />
    </StyledModal>
  )
}
