import {
  canSubmitTapwriteContent,
  clampProseMirrorPosition,
  hasTapwritePopover,
  isTapwriteInteractionActive,
} from '@/utils/tapwriteEditorState'

const originalDocument = globalThis.document

function mockDocumentQuerySelector(result: Element | null) {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      querySelector: jest.fn(() => result),
    },
  })
}

function restoreDocument() {
  if (originalDocument) {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: originalDocument,
    })
    return
  }

  delete (globalThis as { document?: Document }).document
}

describe('tapwriteEditorState', () => {
  afterEach(() => {
    restoreDocument()
  })

  it('detects active Tapwrite interactions from status flags', () => {
    expect(isTapwriteInteractionActive({ isListActive: true })).toBe(true)
    expect(isTapwriteInteractionActive({ isFloatingMenuActive: true })).toBe(true)
    expect(isTapwriteInteractionActive({ isListActive: false, isFloatingMenuActive: false })).toBe(false)
  })

  it('treats Tippy popovers as active Tapwrite interactions', () => {
    mockDocumentQuerySelector({} as Element)

    expect(hasTapwritePopover()).toBe(true)
    expect(isTapwriteInteractionActive({ isListActive: false, isFloatingMenuActive: false })).toBe(true)
  })

  it('blocks content submission while Tapwrite interactions are active', () => {
    expect(canSubmitTapwriteContent(true)).toBe(false)

    mockDocumentQuerySelector({} as Element)

    expect(canSubmitTapwriteContent(false)).toBe(false)
  })

  it('allows content submission when no Tapwrite interaction is active', () => {
    expect(canSubmitTapwriteContent(false)).toBe(true)
  })

  it('clamps ProseMirror positions to the current document bounds', () => {
    expect(clampProseMirrorPosition(-7, 12)).toBe(0)
    expect(clampProseMirrorPosition(7, 12)).toBe(7)
    expect(clampProseMirrorPosition(20, 12)).toBe(12)
  })
})
