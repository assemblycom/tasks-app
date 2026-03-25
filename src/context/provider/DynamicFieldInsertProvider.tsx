'use client'

import { DynamicFieldInsertFn } from '@/app/manage-templates/ui/TemplateDetails'
import { createContext, ReactNode, useCallback, useContext, useRef } from 'react'

interface DynamicFieldInsertContextValue {
  registerHandler: (handler: DynamicFieldInsertFn) => void
  insertField: (fieldKey: string) => void
}

export const DynamicFieldInsertContext = createContext<DynamicFieldInsertContextValue | null>(null)

export function DynamicFieldInsertProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<DynamicFieldInsertFn | null>(null)

  const registerHandler = useCallback((handler: DynamicFieldInsertFn) => {
    handlerRef.current = handler
  }, [])

  const insertField = useCallback((fieldKey: string) => {
    handlerRef.current?.(fieldKey)
  }, [])

  return (
    <DynamicFieldInsertContext.Provider value={{ registerHandler, insertField }}>
      {children}
    </DynamicFieldInsertContext.Provider>
  )
}
