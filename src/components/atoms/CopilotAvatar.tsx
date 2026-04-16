import { NoAssigneeAvatarLarge, PersonIcon, PersonIconSmall } from '@/icons'
import { IAssigneeCombined } from '@/types/interfaces'
import { getAssigneeInitials } from '@/utils/assignee'
import { Avatar, Box, SxProps, Theme } from '@mui/material'
import { clsx } from 'clsx'
import { Avatar as AssemblyAvatar } from 'copilot-design-system'
import { ComponentProps, ReactNode, useMemo } from 'react'

interface CopilotAvatarProps {
  currentAssignee?: IAssigneeCombined
  alt?: string
  size?: ComponentProps<typeof AssemblyAvatar>['size']
  icon?: ReactNode
  style?: ComponentProps<typeof AssemblyAvatar>['style']
  className?: string
}

const variantMap = {
  circular: 'circle',
  rounded: 'rounded',
  square: 'rounded',
} as const

export const CopilotAvatar = ({ currentAssignee, alt, size = 'sm', icon, className, style }: CopilotAvatarProps) => {
  const avatarSx: SxProps<Theme> = {
    alignItems: 'center',
    justifyContent: 'center',
  }
  const avatarVariant: 'circular' | 'rounded' = currentAssignee?.type === 'companies' ? 'rounded' : 'circular'

  const { fullName, initials } = useMemo(() => {
    return currentAssignee ? getAssigneeInitials(currentAssignee) : { fullName: '', initials: '' }
  }, [currentAssignee?.name, currentAssignee?.familyName, currentAssignee?.givenName])

  if (icon) {
    const sizeMap: Record<string, number> = { '3xs': 12, '2xs': 16, xs: 20 }
    const dimension = sizeMap[size]
    return (
      <Avatar
        sx={{ ...avatarSx, ...(dimension ? { width: dimension, height: dimension } : {}) }}
        variant={avatarVariant}
        style={style}
      >
        {icon}
      </Avatar>
    )
  }
  if (!currentAssignee || (currentAssignee?.name || currentAssignee?.givenName) === 'No assignee') {
    return (
      <Box>
        {size === '2xs' || size === '3xs' ? <PersonIconSmall /> : size === 'lg' ? <NoAssigneeAvatarLarge /> : <PersonIcon />}
      </Box>
    )
  }

  return (
    <AssemblyAvatar
      className={clsx(className, size === 'xs' ? 'avatar-xs' : '')}
      alt={alt || fullName}
      src={currentAssignee.iconImageUrl || currentAssignee.avatarImageUrl || undefined}
      size={size}
      fallbackColor={currentAssignee?.fallbackColor || ''}
      text={initials}
      variant={variantMap[avatarVariant]}
      style={style}
    />
  )
}
