'use client'

import { Stack, Typography } from '@mui/material'
import { Icon } from 'copilot-design-system'

export const EmptyTemplates = () => {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      sx={{
        border: (theme) => `1px solid ${theme.color.borders.borderDisabled}`,
        borderRadius: '8px',
        background: (theme) => theme.color.base.white,
        height: '151px',
      }}
    >
      <Stack alignItems="center" rowGap="6px">
        <Icon icon="Templates" width={22} height={22} />
        <Stack alignItems="center" rowGap="4px">
          <Typography sx={{ fontSize: '14px', fontWeight: 500, lineHeight: '22px' }}>No templates found</Typography>
          <Typography
            sx={{ fontSize: '12px', fontWeight: 400, lineHeight: '20px', color: (theme) => theme.color.gray[500] }}
          >
            Templates will be shown here
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  )
}
