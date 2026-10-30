interface TapwriteActiveStatus {
  isListActive?: boolean
  isFloatingMenuActive?: boolean
}

export function hasTapwritePopover() {
  if (typeof document === 'undefined') return false

  return document.querySelector('.tippy-box') !== null
}

export function isTapwriteInteractionActive(status: TapwriteActiveStatus) {
  return Boolean(status.isListActive || status.isFloatingMenuActive || hasTapwritePopover())
}

export function canSubmitTapwriteContent(isListOrMenuActive: boolean) {
  return !isListOrMenuActive && !hasTapwritePopover()
}

export function clampProseMirrorPosition(position: number, docSize: number) {
  return Math.max(0, Math.min(position, docSize))
}
