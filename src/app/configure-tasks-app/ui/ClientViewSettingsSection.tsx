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

interface DropdownOption<T> {
  label: string
  value: T
}

const VIEW_MODE_OPTIONS: DropdownOption<ViewMode | null>[] = [
  { label: 'Client decides', value: null },
  { label: 'List', value: ViewMode.list },
  { label: 'Board', value: ViewMode.board },
]

const SHOW_SUBTASKS_OPTIONS: DropdownOption<boolean | null>[] = [
  { label: 'Client decides', value: null },
  { label: 'Shown', value: true },
  { label: 'Hidden', value: false },
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

  const handleViewModeChange = (value: ViewMode | null) => {
    persist({ ...settings, clientDefaultViewMode: value, clientLockViewMode: value ? settings.clientLockViewMode : false })
  }

  const handleShowSubtasksChange = (value: boolean | null) => {
    persist({
      ...settings,
      clientShowSubtasks: value,
      clientLockShowSubtasks: value === null ? false : settings.clientLockShowSubtasks,
    })
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
        <SettingRow
          label="Default view"
          options={VIEW_MODE_OPTIONS}
          value={settings.clientDefaultViewMode ?? null}
          onChange={handleViewModeChange}
          locked={settings.clientLockViewMode ?? false}
          onLockChange={(locked) => persist({ ...settings, clientLockViewMode: locked })}
        />
        <SettingRow
          label="Show subtasks"
          options={SHOW_SUBTASKS_OPTIONS}
          value={settings.clientShowSubtasks ?? null}
          onChange={handleShowSubtasksChange}
          locked={settings.clientLockShowSubtasks ?? false}
          onLockChange={(locked) => persist({ ...settings, clientLockShowSubtasks: locked })}
          topBorder
        />
      </Box>
    </Box>
  )
}

interface SettingRowProps<T> {
  label: string
  options: DropdownOption<T>[]
  value: T
  onChange: (value: T) => void
  locked: boolean
  onLockChange: (locked: boolean) => void
  topBorder?: boolean
}

const SettingRow = <T,>({ label, options, value, onChange, locked, onLockChange, topBorder }: SettingRowProps<T>) => {
  const hasOverride = value !== null

  return (
    <Box sx={{ borderTop: (theme) => (topBorder ? `1px solid ${theme.color.borders.border}` : 'none') }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: '16px', py: '14px' }}>
        <Typography variant="bodyMd">{label}</Typography>
        <OptionDropdown options={options} value={value} onChange={onChange} />
      </Stack>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: '16px', pb: '14px', opacity: hasOverride ? 1 : 0.5 }}
      >
        <Typography variant="bodySm" sx={{ color: (theme) => theme.color.gray[600] }}>
          Lock for clients
        </Typography>
        <StyledSwitch checked={locked} disabled={!hasOverride} onChange={(e) => onLockChange(e.target.checked)} />
      </Stack>
    </Box>
  )
}

const OptionDropdown = <T,>({ options, value, onChange }: Pick<SettingRowProps<T>, 'options' | 'value' | 'onChange'>) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const isOpen = Boolean(anchorEl)
  const selected = options.find((option) => option.value === value) ?? options[0]

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
        {options.map((option) => (
          <MenuItem
            key={option.label}
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
