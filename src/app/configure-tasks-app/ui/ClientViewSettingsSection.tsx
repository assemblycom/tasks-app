'use client'

import { useState, type MouseEvent } from 'react'
import { Box, Menu, MenuItem, Stack, Typography } from '@mui/material'
import { Icon } from 'copilot-design-system'
import { ViewMode } from '@prisma/client'
import { StyledSwitch } from '@/components/inputs/StyledSwitch'
import { updateWorkspaceSettings } from '@/app/configure-tasks-app/actions'
import { ClientViewSettings } from '@/types/dto/workspaceSettings.dto'

interface ClientViewSettingsSectionProps {
  initialSettings: ClientViewSettings
  token: string
}

const VIEW_MODE_OPTIONS: { label: string; value: ViewMode }[] = [
  { label: 'List', value: ViewMode.list },
  { label: 'Board', value: ViewMode.board },
]

export const ClientViewSettingsSection = ({ initialSettings, token }: ClientViewSettingsSectionProps) => {
  const [settings, setSettings] = useState<ClientViewSettings>(initialSettings)

  const persist = async (next: ClientViewSettings) => {
    const previous = settings
    setSettings(next)
    try {
      await updateWorkspaceSettings(token, next)
    } catch (err) {
      console.error('Failed to save client view settings', err)
      setSettings(previous)
    }
  }

  return (
    <Box sx={{ width: '100%', maxWidth: '640px', margin: '0 auto', px: { xs: 2, sm: 0 } }}>
      <Typography variant="lg" sx={{ display: 'block', mb: '12px' }}>
        Client view settings
      </Typography>

      <Box
        sx={{
          border: (theme) => `1px solid ${theme.color.borders.border}`,
          borderRadius: '4px',
          background: (theme) => theme.color.base.white,
          overflow: 'hidden',
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: '16px', py: '14px' }}>
          <Typography variant="bodyMd">Default view</Typography>
          <ViewModeDropdown
            value={settings.clientDefaultViewMode}
            onChange={(value) => persist({ ...settings, clientDefaultViewMode: value })}
          />
        </Stack>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: '16px', py: '14px', borderTop: (theme) => `1px solid ${theme.color.borders.border}` }}
        >
          <Typography variant="bodyMd">Hide subtasks</Typography>
          <StyledSwitch
            checked={settings.clientHideSubtasks}
            onChange={(e) => persist({ ...settings, clientHideSubtasks: e.target.checked })}
          />
        </Stack>
      </Box>
    </Box>
  )
}

const ViewModeDropdown = ({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const isOpen = Boolean(anchorEl)
  const selected = VIEW_MODE_OPTIONS.find((option) => option.value === value) ?? VIEW_MODE_OPTIONS[0]

  return (
    <>
      <Box
        component="button"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={(e: MouseEvent<HTMLButtonElement>) => setAnchorEl(e.currentTarget)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minWidth: '160px',
          padding: '8px 12px',
          bgcolor: (theme) => theme.color.base.white,
          border: (theme) => `1px solid ${isOpen ? theme.color.gray[700] : theme.color.borders.border2}`,
          borderRadius: '6px',
          cursor: 'pointer',
          font: 'inherit',
          textAlign: 'left',
          outline: 'none',
          '&:hover': { borderColor: (theme) => (isOpen ? theme.color.gray[700] : theme.color.gray[200]) },
          '&:focus-visible': { borderColor: (theme) => theme.color.gray[700] },
        }}
      >
        <Typography sx={{ fontSize: '14px', color: (theme) => theme.color.text.text }}>{selected.label}</Typography>
        <Box
          sx={{
            display: 'flex',
            color: (theme) => theme.color.gray[500],
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <Icon icon="ChevronDown" width={16} height={16} />
        </Box>
      </Box>
      <Menu
        anchorEl={anchorEl}
        open={isOpen}
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
                '&:hover, &.Mui-selected, &.Mui-selected:hover': {
                  backgroundColor: (theme) => theme.color.gray[100],
                },
              },
            },
          },
        }}
      >
        {VIEW_MODE_OPTIONS.map((option) => (
          <MenuItem
            key={option.value}
            disableRipple
            selected={option.value === value}
            onClick={() => {
              onChange(option.value)
              setAnchorEl(null)
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
