import { DYNAMIC_FIELDS } from '@/utils/dynamicFields'
import { Typography, Box, SxProps, Theme } from '@mui/material'
import React from 'react'

type DynamicFieldTitleVariant = 'subtasks' | 'card'

const variantStyles: Record<DynamicFieldTitleVariant, { typographyVariant: 'bodySm' | 'bodyMd'; sx: SxProps<Theme> }> = {
  subtasks: {
    typographyVariant: 'bodySm',
    sx: {
      lineHeight: '21px',
      fontSize: '13px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      flexShrink: 1,
      flexGrow: 0,
      minWidth: 0,
    },
  },
  card: {
    typographyVariant: 'bodyMd',
    sx: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
  },
}

interface DynamicFieldTitleProps {
  title: string
  variant: DynamicFieldTitleVariant
}

/**
 * Renders a title string with {{dynamic field}} tokens styled as inline chips,
 * matching the TapwriteDynamicFieldTemplate styling.
 */
const DynamicFieldTitle = ({ title, variant }: DynamicFieldTitleProps) => {
  const parts = parseDynamicFieldTokens(title)
  const { typographyVariant, sx } = variantStyles[variant]

  return (
    <Typography component="span" variant={typographyVariant} sx={sx}>
      {parts.map((part, index) =>
        part.isDynamic ? (
          <Box
            key={index}
            component="span"
            sx={{
              border: '1px solid #DFE1E4',
              color: 'var(--text-secondary)',
              borderRadius: '4px',
              padding: '0 4px',
              whiteSpace: 'nowrap',
              fontSize: 'inherit',
              lineHeight: 'inherit',
            }}
          >
            {`{{${part.text}}}`}
          </Box>
        ) : (
          <React.Fragment key={index}>{part.text}</React.Fragment>
        ),
      )}
    </Typography>
  )
}

function parseDynamicFieldTokens(text: string): { text: string; isDynamic: boolean }[] {
  const parts: { text: string; isDynamic: boolean }[] = []
  const regex = /\{\{([^}]+)\}\}/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), isDynamic: false })
    }
    const key = match[1]
    const isDynamic = DYNAMIC_FIELDS.some((f) => f.key === key)
    if (isDynamic) {
      parts.push({ text: key, isDynamic: true })
    } else {
      parts.push({ text: match[0], isDynamic: false })
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isDynamic: false })
  }

  return parts
}

export default DynamicFieldTitle
