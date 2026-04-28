'use client'

import { useState } from 'react'
import { Box, MenuItem, Select, Stack, Typography } from '@mui/material'
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

  const isEnabled = draftValue > 0
  const hasUnsavedChanges = draftValue !== savedValue

  const handleToggle = (checked: boolean) => {
    setDraftValue(checked ? DEFAULT_DAYS_ON_ENABLE : 0)
  }

  const handleDaysChange = (days: AutoArchiveAfterDays) => {
    setDraftValue(days)
  }

  usePrimaryCta(
    {
      label: 'Save settings',
      onClick: async () => {
        if (!hasUnsavedChanges || isSaving) return
        setIsSaving(true)
        try {
          await updateWorkspaceSettings(token, { autoArchiveAfterDays: draftValue })
          setSavedValue(draftValue)
        } catch (err) {
          console.error('Failed to save workspace settings', err)
        } finally {
          setIsSaving(false)
        }
      },
    },
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
        <Stack
          direction="row"
          alignItems={isEnabled ? 'center' : 'flex-start'}
          justifyContent="space-between"
          sx={{ px: '16px', py: '14px' }}
        >
          <Stack direction="column" gap="4px">
            <Typography variant="bodyMd">Auto archive completed tasks</Typography>
            {!isEnabled && (
              <Typography variant="bodySm" sx={{ color: (theme) => theme.color.gray[500] }}>
                Automatically archive completed tasks after {DEFAULT_DAYS_ON_ENABLE} days
              </Typography>
            )}
          </Stack>
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
            <Select
              value={draftValue}
              onChange={(e) => handleDaysChange(Number(e.target.value) as AutoArchiveAfterDays)}
              fullWidth
              size="small"
              sx={{
                background: (theme) => theme.color.base.white,
              }}
            >
              {DAY_OPTIONS.map((days) => (
                <MenuItem key={days} value={days}>
                  {days} days
                </MenuItem>
              ))}
            </Select>
          </Box>
        )}
      </Box>
    </Box>
  )
}
