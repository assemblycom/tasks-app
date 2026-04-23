import { DynamicFieldInsertContext } from '@/context/provider/DynamicFieldInsertProvider'
import { useContext } from 'react'

export function useDynamicFieldInsert() {
  const context = useContext(DynamicFieldInsertContext)

  if (!context) {
    throw new Error('useDynamicFieldInsert must be used within DynamicFieldInsertProvider')
  }

  return context
}
