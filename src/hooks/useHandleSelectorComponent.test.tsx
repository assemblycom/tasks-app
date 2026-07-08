import { act } from 'react'
import { useEffect } from 'react'
import { JSDOM } from 'jsdom'
import type { SelectorType } from '@/components/inputs/Selector'
import { useHandleSelectorComponent } from '@/hooks/useHandleSelectorComponent'

const initialItem = { id: 'initial' }
const updatedItem = { id: 'updated' }
const templateSelector = 'templateSelected' as SelectorType

const setupDom = () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousNavigator = globalThis.navigator
  const previousActEnvironment = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT')

  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator })
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

  return () => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow })
    Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument })
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previousNavigator })
    if (previousActEnvironment) {
      Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousActEnvironment)
    } else {
      Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
    }
    dom.window.close()
  }
}

describe('useHandleSelectorComponent', () => {
  it('keeps the imperative updater stable after local selector state changes', async () => {
    const cleanupDom = setupDom()
    const { createRoot } = await import('react-dom/client')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const effectRuns = jest.fn()

    const Probe = () => {
      const { updateRenderingItem } = useHandleSelectorComponent({
        item: initialItem,
        type: templateSelector,
      })

      useEffect(() => {
        effectRuns()
        updateRenderingItem(updatedItem)
      }, [updateRenderingItem])

      return null
    }

    await act(async () => {
      root.render(<Probe />)
    })

    expect(effectRuns).toHaveBeenCalledTimes(1)

    act(() => {
      root.unmount()
    })
    container.remove()
    cleanupDom()
  })
})
