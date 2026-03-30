'use client'

import { useTitleEditor } from '@/components/inputs/tiptap/useTitleEditor'
import { Box, styled } from '@mui/material'
import { Editor, EditorContent } from '@tiptap/react'

interface TitleEditorProps {
  value: string
  onChange: (plainText: string) => void
  placeholder?: string
  autoFocus?: boolean
  fontSize?: string
  lineHeight?: string
  fontWeight?: number
  onEditorReady?: (editor: Editor) => void
}

export const TitleEditor = ({
  value,
  onChange,
  placeholder = '',
  autoFocus,
  fontSize = '16px',
  lineHeight = '24px',
  fontWeight = 500,
  onEditorReady,
}: TitleEditorProps) => {
  const editor = useTitleEditor({ value, onChange, placeholder, autoFocus, onEditorReady })

  return (
    <StyledEditorWrapper
      sx={{
        '& .tiptap-title-editor p': {
          fontSize: `${fontSize} !important`,
          lineHeight: `${lineHeight} !important`,
          fontWeight: `${fontWeight} !important`,
        },
      }}
    >
      <EditorContent editor={editor} />
    </StyledEditorWrapper>
  )
}

const StyledEditorWrapper = styled(Box)(({ theme }) => ({
  width: '100%',
  '& .ProseMirror': {
    outline: 'none',
    color: theme.color.gray[600],
    fontFamily: 'inherit',
    minHeight: '1em',
  },
  '& .ProseMirror p.is-editor-empty:first-of-type::before': {
    content: 'attr(data-placeholder)',
    color: theme.color.gray[400],
    pointerEvents: 'none',
    float: 'left',
    height: 0,
  },
}))
