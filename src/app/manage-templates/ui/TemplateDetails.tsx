'use client'

import { StyledModal } from '@/app/detail/ui/styledComponent'
import AttachmentLayout from '@/components/AttachmentLayout'
import { TitleEditor } from '@/components/inputs/tiptap/TitleEditor'
import { useDynamicFieldInsert } from '@/context/hooks/useDynamicFieldInsert'
import type { Editor } from '@tiptap/react'
import { ConfirmDeleteUI } from '@/components/layouts/ConfirmDeleteUI'
import { MAX_UPLOAD_LIMIT } from '@/constants/attachments'
import { useDebounce, useDebounceWithCancel } from '@/hooks/useDebounce'
import { selectTaskDetails, setOpenImage, setShowConfirmDeleteModal } from '@/redux/features/taskDetailsSlice'
import { clearTemplateFields, selectCreateTemplate } from '@/redux/features/templateSlice'
import store from '@/redux/store'
import { CreateTemplateRequest } from '@/types/dto/templates.dto'
import { AttachmentTypes, ITemplate } from '@/types/interfaces'
import { deleteEditorAttachmentsHandler, uploadAttachmentHandler } from '@/utils/attachmentUtils'
import { insertAutofillAtCursor, insertAutofillIntoHtml } from '@/utils/sidebarFieldInsert'
import { createUploadFn } from '@/utils/createUploadFn'
import {
  TapwriteDynamicFieldDropdown,
  TapwriteDynamicFieldTemplate,
  tapwriteDynamicFields,
} from '@/components/inputs/TapwriteDynamicFieldDropdown'
import { Box } from '@mui/material'
import { MouseEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { Tapwrite } from 'tapwrite'

export type DynamicFieldInsertFn = (fieldKey: string) => void

interface TemplateDetailsProps {
  template: ITemplate
  template_id: string
  handleDeleteTemplate: (templateId: string) => void
  handleEditTemplate: (payload: CreateTemplateRequest, templateId: string) => void
  updateTemplateDetail: (detail: string) => void
  updateTemplateTitle: (title: string) => void
  token: string
}

export default function TemplateDetails({
  template,
  template_id,
  handleDeleteTemplate,
  handleEditTemplate,
  updateTemplateDetail,
  updateTemplateTitle,
  token,
}: TemplateDetailsProps) {
  const [updateTitle, setUpdateTitle] = useState('')
  const [updateDetail, setUpdateDetail] = useState('')
  const { activeTemplate, targetTemplateId, taskName } = useSelector(selectCreateTemplate)
  const [isUserTyping, setIsUserTyping] = useState(false)
  const [activeUploads, setActiveUploads] = useState(0)

  const { showConfirmDeleteModal } = useSelector(selectTaskDetails)

  const handleImagePreview = (e: MouseEvent<unknown>) => {
    store.dispatch(setOpenImage((e.target as HTMLImageElement).src))
  }
  const didMount = useRef(false)

  useEffect(() => {
    if (!isUserTyping && activeUploads === 0) {
      const currentTemplate = activeTemplate?.id === template_id ? activeTemplate : template
      if (currentTemplate) {
        setUpdateTitle(currentTemplate.title || '')
        setUpdateDetail(currentTemplate.body ?? '')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTemplate?.title, activeTemplate?.body, template_id, activeUploads, template])

  const _titleUpdateDebounced = async (title: string) => updateTemplateTitle(title)
  const [titleUpdateDebounced, cancelTitleUpdateDebounced] = useDebounceWithCancel(_titleUpdateDebounced, 1500)

  const _detailsUpdateDebounced = async (details: string) => updateTemplateDetail(details)
  const detailsUpdateDebounced = useDebounce(_detailsUpdateDebounced)

  const resetTypingFlag = useCallback(() => {
    setIsUserTyping(false)
  }, [])

  const [debouncedResetTypingFlag, _cancelDebouncedResetTypingFlag] = useDebounceWithCancel(resetTypingFlag, 1500)
  const [debouncedResetTypingFlagTitle, cancelDebouncedResetTypingFlagTitle] = useDebounceWithCancel(resetTypingFlag, 2500)

  const handleTitleChange = (newTitle: string) => {
    setUpdateTitle(newTitle)
    if (newTitle.trim() == '') {
      cancelTitleUpdateDebounced()
      cancelDebouncedResetTypingFlagTitle()
      return
    }
    setIsUserTyping(true)
    titleUpdateDebounced(newTitle)
    debouncedResetTypingFlagTitle()
  }
  const titleEditorRef = useRef<Editor | null>(null)
  const tapwriteEditorRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>
  const tapwriteWrapperRef = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<'title' | 'description' | null>(null)

  useEffect(() => {
    const el = tapwriteWrapperRef.current
    if (!el) return

    // Suppress Tapwrite's onFocus={() => editor.commands.focus("end")} which overrides
    // cursor placement. Capture phase intercepts before React's event delegation.
    let mouseDownInside = false
    const onMouseDown = () => {
      mouseDownInside = true
      requestAnimationFrame(() => {
        mouseDownInside = false
      })
    }
    const onFocusIn = (e: Event) => {
      if (mouseDownInside || lastFocusedRef.current === 'description') {
        e.stopPropagation()
      }
    }

    // Handle dynamic field drops manually so ProseMirror doesn't create a NodeSelection.
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('application/x-dynamic-field')) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }
    }
    const onDrop = (e: DragEvent) => {
      const fieldKey = e.dataTransfer?.getData('application/x-dynamic-field')
      if (!fieldKey) return
      e.preventDefault()
      e.stopPropagation()

      const range = document.caretRangeFromPoint(e.clientX, e.clientY)
      const proseMirrorEl = el.querySelector('.ProseMirror')
      if (!range || !proseMirrorEl?.contains(range.startContainer)) return

      const autofillEl = document.createElement('autofill-field')
      autofillEl.setAttribute('data-value', fieldKey)
      const spaceNode = document.createTextNode('\u00A0')
      range.collapse(true)
      range.insertNode(spaceNode)
      range.insertNode(autofillEl)
      range.setStartAfter(spaceNode)
      range.collapse(true)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }

    el.addEventListener('mousedown', onMouseDown, true)
    el.addEventListener('focusin', onFocusIn, true)
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('drop', onDrop, true)
    return () => {
      el.removeEventListener('mousedown', onMouseDown, true)
      el.removeEventListener('focusin', onFocusIn, true)
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('drop', onDrop, true)
    }
  }, [])

  const updateDetailRef = useRef(updateDetail)
  updateDetailRef.current = updateDetail

  const handleSidebarFieldInsert = useCallback((fieldKey: string) => {
    // 1. Title was last focused — TipTap's .focus() restores its stored cursor position
    const titleEditor = titleEditorRef.current
    if (lastFocusedRef.current === 'title' && titleEditor) {
      titleEditor
        .chain()
        .focus()
        .insertContent([
          { type: 'autofillField', attrs: { value: fieldKey } },
          { type: 'text', text: ' ' },
        ])
        .run()
      return
    }

    // 2. Description was last focused — insert at cursor via DOM
    if (tapwriteEditorRef.current && insertAutofillAtCursor(tapwriteEditorRef.current, fieldKey)) {
      return
    }

    // 3. Both blurred — append to end of description
    const newBody = insertAutofillIntoHtml(updateDetailRef.current, fieldKey)
    setUpdateDetail(newBody)
    setIsUserTyping(true)
    detailsUpdateDebounced(newBody)
    debouncedResetTypingFlag()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dynamicFieldInsertCtx = useDynamicFieldInsert()

  useEffect(() => {
    dynamicFieldInsertCtx?.registerHandler(handleSidebarFieldInsert)
  }, [handleSidebarFieldInsert, dynamicFieldInsertCtx])

  const handleDetailChange = (content: string) => {
    if (!didMount.current) {
      didMount.current = true
      return //skip the update on first mount.
    }
    if (content === updateDetail) {
      return
    }

    setUpdateDetail(content)
    setIsUserTyping(true)
    detailsUpdateDebounced(content)
    debouncedResetTypingFlag()
  }

  const uploadFn = createUploadFn({
    token,
    workspaceId: template.workspaceId,
    getEntityId: () => template_id,
    attachmentType: AttachmentTypes.TEMPLATE,
    onUploadStart: () => setActiveUploads((prev) => prev + 1),
    onUploadEnd: () => setActiveUploads((prev) => prev - 1),
  })

  return (
    <>
      <TitleEditor
        value={updateTitle}
        onChange={handleTitleChange}
        onEditorReady={(editor) => {
          titleEditorRef.current = editor
          editor.on('focus', () => {
            lastFocusedRef.current = 'title'
          })
        }}
        fontSize="20px"
        lineHeight="28px"
        fontWeight={500}
      />

      <Box ref={tapwriteWrapperRef} sx={{ height: '100%', width: '100%' }}>
        <Tapwrite
          editorRef={tapwriteEditorRef}
          content={updateDetail}
          onFocus={() => {
            lastFocusedRef.current = 'description'
          }}
          getContent={(content: string) => {
            if (updateDetail !== '') {
              handleDetailChange(content)
            }
          }}
          editorClass="tapwrite-task-editor"
          placeholder="Add description..."
          uploadFn={uploadFn}
          handleImageDoubleClick={handleImagePreview}
          deleteEditorAttachments={(url) => deleteEditorAttachmentsHandler(url, token ?? '', template_id, null)}
          attachmentLayout={(props) => <AttachmentLayout {...props} />}
          addAttachmentButton
          maxUploadLimit={MAX_UPLOAD_LIMIT}
          dynamicFieldConfig={{
            fields: tapwriteDynamicFields,
            dropdownComponent: TapwriteDynamicFieldDropdown,
            templateComponent: TapwriteDynamicFieldTemplate,
          }}
        />
      </Box>
      <StyledModal
        open={showConfirmDeleteModal}
        onClose={() => store.dispatch(setShowConfirmDeleteModal())}
        aria-labelledby="delete-task-modal"
        aria-describedby="delete-task"
      >
        <ConfirmDeleteUI
          handleCancel={() => store.dispatch(setShowConfirmDeleteModal())}
          handleDelete={() => {
            store.dispatch(setShowConfirmDeleteModal())
            handleDeleteTemplate(targetTemplateId)
            store.dispatch(clearTemplateFields())
          }}
          description={`"${taskName}" will be permanently deleted.`}
          customBody={'Delete template?'}
        />
      </StyledModal>
    </>
  )
}
