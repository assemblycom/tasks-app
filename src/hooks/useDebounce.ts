import { useRef, useEffect, useCallback } from 'react'

type Timer = ReturnType<typeof setTimeout>
type SomeFunction = (...args: any[]) => void
/**
 *
 * @param func The original, non debounced function (You can pass any number of args to it)
 * @param delay The delay (in ms) for the function to return
 * @returns The debounced function, which will run only if the debounced function has not been called in the last (delay) ms
 */

export function useDebounce<Func extends SomeFunction>(func: Func, delay = 500) {
  const timer = useRef<Timer | null>(null)
  const pendingArgs = useRef<Parameters<Func> | null>(null)
  // Captured at call time — not via a ref that follows every render — so a pending
  // save always fires against the callback that was live when the user typed.
  const pendingFunc = useRef<Func | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      const fn = pendingFunc.current
      const args = pendingArgs.current
      pendingFunc.current = null
      pendingArgs.current = null
      if (fn && args) fn(...args)
    }
  }, [])

  const debouncedFunction = ((...args: Parameters<Func>) => {
    pendingArgs.current = args
    pendingFunc.current = func
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      const fn = pendingFunc.current
      const a = pendingArgs.current
      pendingFunc.current = null
      pendingArgs.current = null
      if (fn && a) fn(...a)
    }, delay)
  }) as Func

  return debouncedFunction
}

export function useDebounceWithCancel<Func extends SomeFunction>(func: Func, delay = 500) {
  const timer = useRef<Timer | null>(null)
  const pendingArgs = useRef<Parameters<Func> | null>(null)
  const pendingFunc = useRef<Func | null>(null)

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const fn = pendingFunc.current
    const args = pendingArgs.current
    pendingFunc.current = null
    pendingArgs.current = null
    if (fn && args) fn(...args)
  }, [])

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    pendingFunc.current = null
    pendingArgs.current = null
  }, [])

  useEffect(() => {
    return flush
  }, [flush])

  const debouncedFunction = ((...args: Parameters<Func>) => {
    pendingArgs.current = args
    pendingFunc.current = func
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      const fn = pendingFunc.current
      const a = pendingArgs.current
      pendingFunc.current = null
      pendingArgs.current = null
      if (fn && a) fn(...a)
    }, delay)
  }) as Func

  return [debouncedFunction, cancel, flush] as const
}
