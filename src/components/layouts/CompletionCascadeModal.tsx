'use client'

import { StyledModal } from '@/app/detail/ui/styledComponent'
import { ConfirmUI } from '@/components/layouts/ConfirmUI'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'

interface CompletionCascadeModalProps {
  targetState: WorkflowStateResponse | null
  subtaskCount: number
  onUpdate: () => void
  onSkip: () => void
  onClose: () => void
}

export const CompletionCascadeModal = ({
  targetState,
  subtaskCount,
  onUpdate,
  onSkip,
  onClose,
}: CompletionCascadeModalProps) => {
  const plural = subtaskCount === 1 ? '' : 's'
  return (
    <StyledModal
      open={!!targetState}
      onClose={(e: React.MouseEvent) => {
        e.stopPropagation()
        onClose()
      }}
      aria-labelledby="confirm-cascade-complete-modal"
      aria-describedby="confirm-cascade-complete"
    >
      <ConfirmUI
        handleCancel={onClose}
        handleConfirm={onUpdate}
        secondaryButtonText={`Skip subtask${plural}`}
        handleSecondary={onSkip}
        buttonText="Update"
        title={`Update the status of open subtask${plural} too?`}
        description={
          <>
            This task still has <strong>{subtaskCount}</strong> open subtask{plural}. Would you like to also update{' '}
            {plural ? 'their' : 'its'} status to <strong>{targetState?.name}</strong>?
          </>
        }
      />
    </StyledModal>
  )
}
