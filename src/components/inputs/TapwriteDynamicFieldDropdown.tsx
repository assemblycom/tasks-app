'use client'

import { DYNAMIC_FIELDS } from '@/utils/dynamicFields'
import { Box, MenuItem, Stack, Typography } from '@mui/material'
import { Icon } from 'copilot-design-system'
import type { DynamicFieldDropdownProps, HandlebarTemplateProps } from 'tapwrite'

export const TapwriteDynamicFieldDropdown = ({ items, onSelect, selectedIndex }: DynamicFieldDropdownProps) => {
  return (
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
        {items.map((field, index) => (
          <MenuItem
            key={field.value}
            onClick={() => onSelect(field)}
            selected={index === selectedIndex}
            sx={{
              padding: '2px 20px 2px 12px',
              '&:hover': {
                backgroundColor: (theme) => theme.color.gray[100],
              },
              '&.Mui-selected': {
                backgroundColor: (theme) => theme.color.gray[100],
              },
            }}
          >
            <Stack direction="row" alignItems="center">
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
                {field.label}
              </Box>
            </Stack>
          </MenuItem>
        ))}
      </Box>
    </Box>
  )
}

/** Template component that renders dynamic field tokens inline in the Tapwrite editor */
export const TapwriteDynamicFieldTemplate = ({ value, label, showResolved, resolvedValue }: HandlebarTemplateProps) => (
  <span
    style={{
      border: '1px solid #D0D4DA',
      color: '#6B6F76',
      background: '#F5F5F5',
      borderRadius: '4px',
      padding: '0 4px',
      whiteSpace: 'nowrap',
      fontSize: 'inherit',
      lineHeight: 'inherit',
    }}
  >
    {showResolved && resolvedValue ? resolvedValue : `{{${label}}}`}
  </span>
)

/** Tapwrite-compatible dynamic fields mapped from the shared DYNAMIC_FIELDS */
export const tapwriteDynamicFields = DYNAMIC_FIELDS.map((f) => ({
  value: f.key,
  label: f.label,
}))
