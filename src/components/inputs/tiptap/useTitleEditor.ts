import {
  TapwriteDynamicFieldDropdown,
  TapwriteDynamicFieldTemplate,
  tapwriteDynamicFields,
} from '@/components/inputs/TapwriteDynamicFieldDropdown'
import Document from '@tiptap/extension-document'
import History from '@tiptap/extension-history'
import Paragraph from '@tiptap/extension-paragraph'
import Placeholder from '@tiptap/extension-placeholder'
import Text from '@tiptap/extension-text'
import { Editor, useEditor } from '@tiptap/react'
import { AutofillExtension } from 'tapwrite'
import { useEffect, useRef } from 'react'

const SingleLineDocument = Document.extend({ content: 'paragraph' })

/**
 * Extract plain text with {{tokens}} from TipTap editor state.
 */
export function editorToPlainText(editor: Editor): string {
  let result = ''
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'autofillField' && node.attrs.value) {
      result += `{{${node.attrs.value}}}`
    } else if (node.isText) {
      result += node.text ?? ''
    }
  })
  return result
}

/**
 * Convert plain text with {{tokens}} to HTML that AutofillExtension can parse.
 */
export function plainTextToHtml(text: string): string {
  if (!text) return '<p></p>'
  const html = text.replace(/\{\{([^{}]+)\}\}/g, (_, key) => `<autofill-field data-value="${key}"></autofill-field>`)
  return `<p>${html}</p>`
}

interface UseTitleEditorOptions {
  value: string
  onChange: (plainText: string) => void
  placeholder?: string
  autoFocus?: boolean
}

export function useTitleEditor({ value, onChange, placeholder = '', autoFocus }: UseTitleEditorOptions) {
  const isInternalRef = useRef(false)

  const editor = useEditor({
    extensions: [
      SingleLineDocument,
      Paragraph,
      Text,
      History,
      Placeholder.configure({ placeholder }),
      AutofillExtension.configure({
        dynamicFields: tapwriteDynamicFields,
        resolvedValues: {},
        showDynamicFieldValue: false,
        CustomDropdown: TapwriteDynamicFieldDropdown,
        TemplateComponent: TapwriteDynamicFieldTemplate,
      }),
    ],
    content: plainTextToHtml(value),
    immediatelyRender: false,
    autofocus: autoFocus ? 'end' : false,

    onUpdate: ({ editor }) => {
      if (isInternalRef.current) return
      onChange(editorToPlainText(editor))
    },

    editorProps: {
      attributes: {
        class: 'tiptap-title-editor',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter') {
          const dropdownOpen = !!document.querySelector('.tippy-box')
          if (!dropdownOpen) return true
        }
        return false
      },
    },
  })

  // Sync external value changes
  useEffect(() => {
    if (!editor) return
    const currentText = editorToPlainText(editor)
    if (currentText !== value) {
      isInternalRef.current = true
      editor.commands.setContent(plainTextToHtml(value))
      isInternalRef.current = false
    }
  }, [value, editor])

  return editor
}
