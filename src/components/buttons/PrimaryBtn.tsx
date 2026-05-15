import { AddIcon } from '@/icons'
import { Button, Typography } from '@mui/material'
import { ReactNode } from 'react'

export const PrimaryBtn = ({
  startIcon,
  buttonText,
  handleClick,
  buttonBackground,
  disabled,
  padding,
  height,
  variant = 'default',
}: {
  startIcon?: ReactNode
  buttonText: string
  handleClick: () => void
  buttonBackground?: string
  disabled?: boolean
  padding?: string
  height?: string
  variant?: 'default' | 'danger'
}) => {
  return (
    <Button
      variant="contained"
      startIcon={startIcon ? <AddIcon /> : null}
      disabled={disabled}
      sx={(theme) => ({
        textTransform: 'none',
        bgcolor: buttonBackground || (variant == 'danger' ? theme.color.red[200] : theme.color.gray[600]),
        boxShadow: 'none',
        '&:hover': {
          backgroundColor: buttonBackground || (variant == 'danger' ? theme.color.red[200] : theme.color.gray[600]),
          boxShadow: 'none',
        },
        borderRadius: '4px',
        cursor: 'pointer',
        padding: padding ?? 'none',
        height: height ?? 'auto',
      })}
      onClick={() => handleClick()}
      disableRipple
      disableTouchRipple
    >
      <Typography variant="sm">{buttonText}</Typography>
    </Button>
  )
}
