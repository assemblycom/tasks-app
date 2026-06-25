/**
 * @jest-environment jsdom
 */

import {
  canSubmitTapwriteContent,
  clampProseMirrorPosition,
  hasTapwritePopover,
  isTapwriteInteractionActive,
} from '@/utils/tapwriteEditorState'

describe('tapwriteEditorState', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('detects active Tapwrite interactions from status flags', () => {
    expect(isTapwriteInteractionActive({ isListActive: true })).toBe(true)
    expect(isTapwriteInteractionActive({ isFloatingMenuActive: true })).toBe(true)
    expect(isTapwriteInteractionActive({ isListActive: false, isFloatingMenuActive: false })).toBe(false)
  })

  it('treats Tippy popovers as active Tapwrite interactions', () => {
    document.body.innerHTML = '<div class="tippy-box"></div>'

    expect(hasTapwritePopover()).toBe(true)
    expect(isTapwriteInteractionActive({ isListActive: false, isFloatingMenuActive: false })).toBe(true)
  })

  it('blocks content submission while Tapwrite interactions are active', () => {
    expect(canSubmitTapwriteContent(true)).toBe(false)

    document.body.innerHTML = '<div class="tippy-box"></div>'

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
