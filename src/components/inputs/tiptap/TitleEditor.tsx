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
  onBlur?: () => void
  errorMessage?: string | null
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
  onBlur,
  errorMessage,
}: TitleEditorProps) => {
  const editor = useTitleEditor({ value, onChange, placeholder, autoFocus, onEditorReady, onBlur })

  return (
    <>
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
      {errorMessage && <ErrorText role="alert">{errorMessage}</ErrorText>}
    </>
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
  // The chip border (1px top + 1px bottom) makes the inline-flex node view taller than
  // the paragraph line-height, expanding the line box. Swapping to outline within this
  // context fixes it — outline is cosmetically identical but has no effect on layout.
  '& .tiptap-title-editor [data-node-view-wrapper] > span': {
    border: 'none !important',
    outline: '1px solid #DFE1E4',
    outlineOffset: '-1px', // This pulls the outline inward so it sits exactly where the border was
  },
}))

const ErrorText = styled('p')(({ theme }) => ({
  margin: '4px 0 0',
  color: theme.palette.error.main,
  fontSize: '12px',
  lineHeight: '18px',
}))
