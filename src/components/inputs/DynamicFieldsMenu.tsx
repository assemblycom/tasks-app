'use client'

import { DynamicFieldPopperProps } from '@/hooks/useDynamicFieldTrigger'
import { DYNAMIC_FIELDS } from '@/utils/dynamicFields'
import { Label } from '@mui/icons-material'
import { Box, ClickAwayListener, Grow, MenuItem, Popper, Stack, Typography } from '@mui/material'
import { Icon } from 'copilot-design-system'

export const DynamicFieldsPopper = ({ open, anchorEl, filterText, onSelect, onClose }: DynamicFieldPopperProps) => {
  const filteredFields = DYNAMIC_FIELDS.filter(
    (f) =>
      !filterText ||
      f.key.toLowerCase().startsWith(filterText.toLowerCase()) ||
      f.label.toLowerCase().startsWith(filterText.toLowerCase()),
  )

  if (!open || !anchorEl || filteredFields.length === 0) return null

  return (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement="bottom-start"
      transition
      modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
      sx={{ zIndex: 1300 }}
    >
      {({ TransitionProps }) => (
        <Grow {...TransitionProps} style={{ transformOrigin: 'top left' }}>
          <Box
            sx={(theme) => ({
              border: `1px solid ${theme.color.gray[150]}`,
              borderRadius: '4px',
              backgroundColor: 'white',
              boxShadow: '0px 6px 20px 0px #00000012',
              minWidth: '200px',
              paddingBottom: '17px',
            })}
          >
            <ClickAwayListener mouseEvent="onMouseDown" onClickAway={onClose}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <Stack
                  sx={{
                    padding: '8px 0px 4px 12px',
                    fontWeight: 500,
                    fontSize: '12px',
                    lineHeight: '20px',
                    verticalAlign: 'middle',
                    color: (theme) => theme.color.gray[400],
                  }}
                >
                  Dynamic fields
                </Stack>
                {filteredFields.map((field) => (
                  <MenuItem
                    key={field.key}
                    onClick={() => onSelect(field.key)}
                    sx={{
                      padding: '2px 20px 2px 12px',
                      '&:hover': {
                        backgroundColor: (theme) => theme.color.gray[100],
                      },
                    }}
                  >
                    <Stack direction="row" alignItems="center">
                      <DynamicFieldChip label={field.label} />
                    </Stack>
                  </MenuItem>
                ))}
              </Box>
            </ClickAwayListener>
          </Box>
        </Grow>
      )}
    </Popper>
  )
}

export const DynamicFieldChip = ({ label }: { label: string }) => (
  <Box
    component="span"
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      fontSize: '14px',
      lineHeight: '22px',
      color: (theme) => theme.color.gray[600],
    }}
  >
    <Icon icon="Time" height={10} width={10} style={{ marginRight: '9px', color: 'var(--text-secondary)' }} />
    {label}
  </Box>
)
