'use client'

import { useState } from 'react'

import { TemplateIcon } from '@/icons'
import { Box, Stack, Typography } from '@mui/material'

interface TemplateCardProps {
  title: string
}

export const TemplateCard = ({ title }: TemplateCardProps) => {
  const [isHovered, setIsHovered] = useState(false)
  const handleMouseHover = () => !isHovered && setIsHovered(true)
  const handleMouseLeave = () => isHovered && setIsHovered(false)

  return (
    <Stack
      direction="row"
      sx={{
        border: (theme) => `1px solid ${theme.color.borders.border}`,
        cursor: 'pointer',
        borderRadius: '4px',
        padding: '16px',
        background: (theme) => (isHovered ? theme.color.background.bgCallout : 'white'),
      }}
      justifyContent="space-between"
      alignItems="center"
      onMouseEnter={handleMouseHover}
      onMouseLeave={handleMouseLeave}
    >
      <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center', height: '20px', flex: 1, minWidth: 0 }}>
        <Box sx={{ flexShrink: 0, display: 'flex' }}>
          <TemplateIcon />
        </Box>
        <Typography
          variant="bodyMd"
          sx={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </Typography>
      </Box>
    </Stack>
  )
}
