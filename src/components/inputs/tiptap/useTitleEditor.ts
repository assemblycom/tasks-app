import {
  TapwriteDynamicFieldDropdown,
  TapwriteDynamicFieldTemplate,
  tapwriteDynamicFields,
} from '@/components/inputs/TapwriteDynamicFieldDropdown'
import { getWorstCaseResolvedLength } from '@/utils/dynamicFields'
import Document from '@tiptap/extension-document'
import History from '@tiptap/extension-history'
import Paragraph from '@tiptap/extension-paragraph'
import Placeholder from '@tiptap/extension-placeholder'
import Text from '@tiptap/extension-text'
import { Extension } from '@tiptap/core'
import { Editor, useEditor } from '@tiptap/react'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Fragment, Node } from '@tiptap/pm/model'
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

const TITLE_MAX_LENGTH = 255

interface UseTitleEditorOptions {
  value: string
  onChange: (plainText: string) => void
  placeholder?: string
  autoFocus?: boolean
  onEditorReady?: (editor: Editor) => void
}

function extractTextFromDoc(doc: Node): string {
  let result = ''
  doc.descendants((node) => {
    if (node.type.name === 'autofillField' && node.attrs.value) {
      result += `{{${node.attrs.value}}}`
    } else if (node.isText) {
      result += node.text ?? ''
    }
  })
  return result
}

function createMaxLengthExtension(maxLength: number) {
  return Extension.create({
    name: 'maxLength',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('maxLength'),
          filterTransaction(tr) {
            if (!tr.docChanged) return true
            const newText = extractTextFromDoc(tr.doc)
            return newText.length <= maxLength && getWorstCaseResolvedLength(newText) <= maxLength
          },
        }),
      ]
    },
  })
}

export function useTitleEditor({ value, onChange, placeholder = '', autoFocus, onEditorReady }: UseTitleEditorOptions) {
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
      createMaxLengthExtension(TITLE_MAX_LENGTH),
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
      handleDrop: (view, event) => {
        const fieldKey = event.dataTransfer?.getData('application/x-dynamic-field')
        if (!fieldKey) return false

        event.preventDefault()
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
        if (!pos) return true

        const { schema } = view.state
        const node = schema.nodes.autofillField.create({ value: fieldKey })
        const space = schema.text(' ')
        const tr = view.state.tr.insert(pos.pos, Fragment.from([node, space]))
        tr.setSelection(TextSelection.create(tr.doc, pos.pos + node.nodeSize + space.nodeSize))
        view.dispatch(tr)
        view.focus()
        // Firefox hides the caret after drag-and-drop; a blur/focus cycle forces it to repaint.
        requestAnimationFrame(() => {
          view.dom.blur()
          view.focus()
        })
        return true
      },
    },
  })

  useEffect(() => {
    if (editor) onEditorReady?.(editor)
  }, [editor, onEditorReady])

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
