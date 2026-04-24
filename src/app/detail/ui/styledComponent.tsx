'use client'

import { MenuBox } from '@/components/inputs/MenuBox'
import { EmojiIcon, ReplyIcon } from '@/icons'
import { KeyboardArrowRight } from '@mui/icons-material'
import { Box, Modal, Stack, Typography, styled } from '@mui/material'
import { UserCompanySelector } from 'copilot-design-system'

export const StyledTypography = styled(Typography)(({ theme }) => ({
  color: theme.color.gray[500],
  fontSize: theme.typography.md.fontSize,
  lineHeight: '22px',
}))

export const BoldTypography = styled(Typography)(({ theme }) => ({
  display: 'inline',
  color: theme.color.gray[600],
  fontSize: theme.typography.md.fontSize,
  lineHeight: '22px',
  fontWeight: 500,
}))

export const AvatarTypography = styled(Typography)(({ theme }) => ({
  color: theme.color.base.white,
  fontSize: theme.typography.bodyMd.fontSize,
}))

export const TypographyContainer = styled(Stack)(({ theme }) => ({
  display: 'block',
  p: {
    display: 'inline',
  },
}))

export const StyledKeyboardIcon = styled(KeyboardArrowRight)(({ theme }) => ({
  color: theme.color.gray[500],
}))

export const StyledBox = styled(Box)(({ theme }) => ({
  borderBottom: `1px solid ${theme.color.borders.borderDisabled}`,
  width: '100%',
}))
export const StyledTiptapDescriptionWrapper = styled(Box)(({ theme }) => ({
  borderBottom: `1px solid ${theme.color.borders.borderDisabled}`,
  width: '100%',
  '.tiptap *': {
    color: theme.color.gray[600],
  },
  '.tiptap p': {
    fontSize: '16px',
  },
}))

export const VerticalLine = styled('div')(({ theme }) => ({
  position: 'absolute',
  left: '9px',
  top: '12px',
  bottom: 0,
  width: '1px',
  height: 'calc(100% + 20px)',
  backgroundColor: theme.color.gray[150],
  zIndex: -10,
}))

export const StyledEmojiIcon = styled(EmojiIcon)(({ theme }) => ({
  '&:hover': {
    background: theme.color.gray[200],
    borderRadius: '5px',
    padding: '2px',
    transform: 'scale(1.2)',
  },
  '&:active': {
    transform: 'scale(0.95)',
  },
}))

export const StyledReplyIcon = styled(ReplyIcon)(({ theme }) => ({
  '&:hover': {
    background: theme.color.gray[200],
    borderRadius: '5px',
    padding: '2px',
    transform: 'scale(1.2)',
  },
  '&:active': {
    transform: 'scale(0.95)',
  },
}))

export const CommentCardContainer = styled(Stack)(({ theme }) => ({
  border: `1px solid ${theme.color.gray[150]}`,
  borderRadius: theme.spacing(theme.shape.radius100),
  background: theme.color.base.white,
  width: '100%',
}))

export const TaskDetailsContainer = styled(Box)(({ theme }) => ({
  maxWidth: '654px',
  justifyContent: 'center',
  alignItems: 'center',
  width: '100%',
  margin: '0 auto',

  display: 'flex',
  flexDirection: 'column',
}))

export const StyledMenuBox = styled(MenuBox)(({ theme }) => ({
  div: {
    background: theme.color.gray[150],
    padding: '4px',
  },
  svg: {
    height: '12px',
    width: '12px',
  },
}))

export const StyledModal = styled(Modal)(({ theme }) => ({
  '& > .MuiBackdrop-root': {
    backgroundColor: theme.color.modal.backdrop,
  },
}))

export const StyledImagePreviewModal = styled(Modal)(() => ({
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'rgba(0, 0, 0, 0.75)',
  width: '100vw',
  height: '100vh',
}))

export const StyledImageTopBar = styled(Box)(() => ({
  backgroundColor: 'rgba(0,0,0,0.60)',
  color: 'white',
  display: 'flex',
  width: '100%',
  justifyContent: 'space-between',
  padding: '16px 20px',
  alignItems: 'center',
  lineHeight: '24px',
  fontWeight: 500,
  gap: '12px',
  '.close-icon-container': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '7px', // 5 + 2
    height: '30px',
    backgroundColor: '#0f0f0f',
    borderRadius: '4px',
    ':hover': {
      backgroundColor: 'rgb(75, 75, 75)',
    },
  },
  '.title-container': {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  '.download-btn': {
    padding: '7px', // 5 + 2
    backgroundColor: 'white',
    borderRadius: '4px',
    ':hover': {
      backgroundColor: 'rgb(248, 249, 250)',
    },
  },
  '@media (max-width: 600px)': {
    justifyContent: 'flex-start',
    '.title-container': {
      marginLeft: '0px',
      gap: '4px',
      flexGrow: 1,
      fontSize: '14px',
    },
    '.download-btn': {
      marginLeft: 'auto',
    },
  },
}))

export const StyledImagePreviewWrapper = styled(Box)(() => ({
  height: '100%',
  userSelect: 'none',
  '#react-doc-viewer': {
    background: 'transparent',
    height: '100%',
    '#header-bar': {
      display: 'none',
    },
    '#proxy-renderer': {
      height: '100%',
      '#image-renderer': {
        background: 'rgba(0,0,0,0)',
      },
    },
    img: {
      maxHeight: '80vh',
      maxWidth: '90vw',
    },
  },
}))
export const StyledImageRenderer = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100%',
  '.react-transform-wrapper': {
    width: '100%',
    height: '100%',
  },
}))

export const StyledZoomControls = styled(Box)(() => ({
  display: 'flex',
  gap: '8px',
  color: 'white',
  position: 'fixed',
  bottom: '24px',
  padding: '8px',
  background: 'rgba(0, 0, 0, 0.85)',
  borderRadius: '4px',
  zIndex: '69',
  '.control-btn': {
    borderRadius: '4px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '5px',
    ':hover': {
      background: 'rgba(75, 75, 75)',
    },
  },
}))

export const CustomDivider = styled(Box)(({ theme }) => ({
  height: '1px',
  width: 'calc(100% + 20px)',
  backgroundColor: theme.color.gray[150],
  marginLeft: '-10px',
  marginRight: '-10px',
}))

export const StyledUserCompanySelector = styled(UserCompanySelector)(() => ({
  width: '294px',
  height: '40px',
  '& [class*="mui-no1ryp"]': {
    maxHeight: '205px',
  },
}))
