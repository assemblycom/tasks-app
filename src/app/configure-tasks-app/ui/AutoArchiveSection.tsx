'use client'

import { useEffect, useRef, useState } from 'react'
import { Box, Menu, MenuItem, Stack, Typography } from '@mui/material'
import { Icon } from 'copilot-design-system'
import { StyledSwitch } from '@/components/inputs/StyledSwitch'
import { usePrimaryCta } from '@/hooks/app-bridge/usePrimaryCta'
import { AUTO_ARCHIVE_AFTER_DAYS_OPTIONS, AutoArchiveAfterDays } from '@/types/dto/workspaceSettings.dto'
import { updateWorkspaceSettings } from '@/app/configure-tasks-app/actions'

const DEFAULT_DAYS_ON_ENABLE = 30

const DAY_OPTIONS = AUTO_ARCHIVE_AFTER_DAYS_OPTIONS.filter((days) => days !== 0)

interface AutoArchiveSectionProps {
  initialAutoArchiveAfterDays: number
  token: string
  portalUrl?: string
}

export const AutoArchiveSection = ({ initialAutoArchiveAfterDays, token, portalUrl }: AutoArchiveSectionProps) => {
  const [savedValue, setSavedValue] = useState<AutoArchiveAfterDays>(initialAutoArchiveAfterDays as AutoArchiveAfterDays)
  const [draftValue, setDraftValue] = useState<AutoArchiveAfterDays>(initialAutoArchiveAfterDays as AutoArchiveAfterDays)
  const [isSaving, setIsSaving] = useState(false)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const isMenuOpen = Boolean(anchorEl)

  const isEnabled = draftValue > 0
  const hasUnsavedChanges = draftValue !== savedValue

  const draftValueRef = useRef(draftValue)
  const isSavingRef = useRef(isSaving)
  useEffect(() => {
    draftValueRef.current = draftValue
  }, [draftValue])
  useEffect(() => {
    isSavingRef.current = isSaving
  }, [isSaving])

  const handleToggle = (checked: boolean) => {
    setDraftValue(checked ? DEFAULT_DAYS_ON_ENABLE : 0)
  }

  const handleDaysChange = (days: AutoArchiveAfterDays) => {
    setDraftValue(days)
  }

  const handleSave = async () => {
    if (isSavingRef.current) return
    setIsSaving(true)
    try {
      const valueToSave = draftValueRef.current
      await updateWorkspaceSettings(token, { autoArchiveAfterDays: valueToSave })
      setSavedValue(valueToSave)
    } catch (err) {
      console.error('Failed to save workspace settings', err)
    } finally {
      setIsSaving(false)
    }
  }

  usePrimaryCta(
    hasUnsavedChanges
      ? {
          label: 'Save settings',
          onClick: handleSave,
        }
      : null,
    { portalUrl },
  )

  return (
    <Box sx={{ width: '100%', maxWidth: '640px', margin: '0 auto', px: { xs: 2, sm: 0 } }}>
      <Typography variant="lg" sx={{ display: 'block', mb: '12px' }}>
        Auto-archive
      </Typography>

      <Box
        sx={{
          border: (theme) => `1px solid ${theme.color.borders.borderDisabled}`,
          borderRadius: '8px',
          background: (theme) => theme.color.base.white,
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: '16px', py: '14px' }}>
          <Typography variant="bodyMd">Auto-archive completed tasks</Typography>
          <StyledSwitch checked={isEnabled} onChange={(e) => handleToggle(e.target.checked)} />
        </Stack>

        {isEnabled && (
          <Box
            sx={{
              borderTop: (theme) => `1px solid ${theme.color.borders.borderDisabled}`,
              px: '16px',
              py: '14px',
            }}
          >
            <Typography variant="bodySm" sx={{ display: 'block', mb: '8px', color: (theme) => theme.color.gray[600] }}>
              Archive after
            </Typography>
            <Box
              component="button"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={isMenuOpen}
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => setAnchorEl(e.currentTarget)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '10px 12px',
                bgcolor: (theme) => theme.color.base.white,
                border: (theme) => `1px solid ${isMenuOpen ? theme.color.gray[700] : theme.color.borders.border2}`,
                borderRadius: '6px',
                cursor: 'pointer',
                font: 'inherit',
                textAlign: 'left',
                outline: 'none',
                transition: 'border-color 120ms ease',
                '&:hover': {
                  borderColor: (theme) => (isMenuOpen ? theme.color.gray[700] : theme.color.gray[200]),
                },
                '&:focus-visible': { borderColor: (theme) => theme.color.gray[700] },
              }}
            >
              <Typography sx={{ fontSize: '14px', color: (theme) => theme.color.text.text }}>{draftValue} days</Typography>
              <Box
                sx={{
                  display: 'flex',
                  color: (theme) => theme.color.gray[500],
                  transition: 'transform 120ms ease',
                  transform: isMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              >
                <Icon icon="ChevronDown" width={16} height={16} />
              </Box>
            </Box>
            <Menu
              anchorEl={anchorEl}
              open={isMenuOpen}
              onClose={() => setAnchorEl(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              transformOrigin={{ vertical: 'top', horizontal: 'left' }}
              transitionDuration={0}
              slotProps={{
                paper: {
                  sx: {
                    mt: '4px',
                    width: anchorEl ? `${anchorEl.clientWidth}px` : undefined,
                    borderRadius: '6px',
                    border: (theme) => `1px solid ${theme.color.borders.border2}`,
                    boxShadow: '0px 6px 20px 0px rgba(0, 0, 0, 0.07)',
                    '& .MuiList-root': { padding: '4px 0' },
                    '& .MuiMenuItem-root': {
                      padding: '8px 12px',
                      fontSize: '14px',
                      transition: 'none',
                      '&:hover, &.Mui-focusVisible, &:focus, &.Mui-selected, &.Mui-selected:hover, &.Mui-selected.Mui-focusVisible':
                        {
                          backgroundColor: (theme) => theme.color.gray[100],
                        },
                    },
                  },
                },
              }}
            >
              {DAY_OPTIONS.map((days) => (
                <MenuItem
                  key={days}
                  disableRipple
                  selected={days === draftValue}
                  onClick={() => {
                    handleDaysChange(days)
                    setAnchorEl(null)
                  }}
                >
                  {days} days
                </MenuItem>
              ))}
            </Menu>
          </Box>
        )}
      </Box>
    </Box>
  )
}
