'use client'

import { useEffect, useRef, useState } from 'react'
import { Box, InputBase, Stack, Typography } from '@mui/material'
import { Icon } from 'copilot-design-system'
import { StateType } from '@prisma/client'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { PrimaryBtn } from '@/components/buttons/PrimaryBtn'
import { SecondaryBtn } from '@/components/buttons/SecondaryBtn'
import { updateWorkflowState } from '@/app/configure-tasks-app/actions'
import store from '@/redux/store'
import { setWorkflowStates } from '@/redux/features/taskBoardSlice'

const STATUS_ICON_BY_TYPE: Record<StateType, 'ToDo' | 'InProgress' | 'SuccessSolid'> = {
  unstarted: 'ToDo',
  backlog: 'ToDo',
  started: 'InProgress',
  completed: 'SuccessSolid',
  cancelled: 'ToDo',
}

const STATUS_ICON_COLOR_BY_TYPE: Record<StateType, string> = {
  unstarted: '#90959D',
  backlog: '#90959D',
  started: '#E5A11A',
  completed: '#115B3B',
  cancelled: '#90959D',
}

interface StatusCustomizationSectionProps {
  initialWorkflowStates: WorkflowStateResponse[]
  token: string
}

export const StatusCustomizationSection = ({ initialWorkflowStates, token }: StatusCustomizationSectionProps) => {
  const [states, setStates] = useState<WorkflowStateResponse[]>(initialWorkflowStates)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editingId && inputRef.current) {
      const input = inputRef.current
      input.focus()
      const end = input.value.length
      input.setSelectionRange(end, end)
    }
  }, [editingId])

  const beginEdit = (state: WorkflowStateResponse) => {
    setEditingId(state.id)
    setDraftName(state.name)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraftName('')
  }

  const saveEdit = async () => {
    if (!editingId) return
    const trimmed = draftName.trim()
    const current = states.find((s) => s.id === editingId)
    if (!current || !trimmed || trimmed === current.name) {
      cancelEdit()
      return
    }

    setSavingId(editingId)
    try {
      const updated = await updateWorkflowState(token, editingId, { name: trimmed })
      const nextStates = states.map((s) => (s.id === editingId ? { ...s, name: updated?.name ?? trimmed } : s))
      setStates(nextStates)
      store.dispatch(setWorkflowStates(nextStates))
      cancelEdit()
    } catch (err) {
      console.error('Failed to rename workflow state', err)
    } finally {
      setSavingId(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  return (
    <Box sx={{ width: '100%', maxWidth: '640px', margin: '0 auto', px: { xs: 2, sm: 0 } }}>
      <Typography variant="lg" sx={{ display: 'block', mb: '12px' }}>
        Status Customization
      </Typography>

      <Box
        sx={{
          border: (theme) => `1px solid ${theme.color.borders.border}`,
          borderRadius: '4px',
          background: (theme) => theme.color.base.white,
          overflow: 'hidden',
        }}
      >
        {states.map((state, index) => {
          const isEditing = editingId === state.id
          const isSaving = savingId === state.id
          const trimmedDraft = draftName.trim()
          const canSave = !!trimmedDraft && trimmedDraft !== state.name && !isSaving

          return (
            <Stack
              key={state.id}
              direction="row"
              alignItems="center"
              sx={{
                px: '12px',
                py: '12px',
                minHeight: '52px',
                borderTop: (theme) => (index === 0 ? 'none' : `1px solid ${theme.color.borders.border}`),
                '&:hover': isEditing
                  ? undefined
                  : {
                      backgroundColor: (theme) => theme.color.gray[100],
                    },
                '&:hover .StatusCustomizationSection-edit': { opacity: isEditing ? 0 : 1 },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                  mr: '12px',
                  color: STATUS_ICON_COLOR_BY_TYPE[state.type],
                }}
              >
                <Icon icon={STATUS_ICON_BY_TYPE[state.type]} width={20} height={20} />
              </Box>

              {isEditing ? (
                <Stack direction="row" alignItems="center" columnGap="8px" sx={{ flex: 1, minWidth: 0 }}>
                  <InputBase
                    inputRef={inputRef}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSaving}
                    inputProps={{ maxLength: 255, 'aria-label': `Rename ${state.name}` }}
                    sx={(theme) => ({
                      flex: 1,
                      height: '28px',
                      px: '12px',
                      py: 0,
                      borderRadius: '4px',
                      border: `1px solid ${theme.color.gray[700]}`,
                      boxSizing: 'border-box',
                      fontFamily: theme.typography.bodyMd.fontFamily,
                      fontSize: theme.typography.bodyMd.fontSize,
                      fontWeight: theme.typography.bodyMd.fontWeight,
                      lineHeight: theme.typography.bodyMd.lineHeight,
                      background: theme.color.base.white,
                      '& input': { padding: 0, height: '100%', boxSizing: 'border-box' },
                    })}
                  />
                  <SecondaryBtn
                    handleClick={cancelEdit}
                    padding="3px 8px"
                    height="25px"
                    buttonContent={
                      <Typography variant="sm" sx={{ color: (theme) => theme.color.gray[700] }}>
                        Cancel
                      </Typography>
                    }
                  />
                  <PrimaryBtn buttonText="Save" handleClick={saveEdit} disabled={!canSave} padding="3px 8px" height="25px" />
                </Stack>
              ) : (
                <>
                  <Typography variant="bodyMd" sx={{ flex: 1, minWidth: 0 }}>
                    {state.name}
                  </Typography>
                  <Box
                    component="button"
                    type="button"
                    aria-label={`Rename ${state.name}`}
                    onClick={() => beginEdit(state)}
                    className="StatusCustomizationSection-edit"
                    sx={(theme) => ({
                      opacity: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      border: 'none',
                      background: 'transparent',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: theme.color.gray[500],
                      '@media (hover: none)': { opacity: 1 },
                      '&:hover': { background: theme.color.gray[100], color: theme.color.gray[700] },
                      '&:focus-visible': { opacity: 1, outline: `1px solid ${theme.color.gray[400]}` },
                    })}
                  >
                    <Icon icon="Edit" width={14} height={14} />
                  </Box>
                </>
              )}
            </Stack>
          )
        })}
      </Box>
    </Box>
  )
}
