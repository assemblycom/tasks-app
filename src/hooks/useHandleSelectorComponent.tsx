import { SelectorType } from '@/components/inputs/Selector'
import { setCreateTaskFields } from '@/redux/features/createTaskSlice'
import { setCreateTemplateFields } from '@/redux/features/templateSlice'
import store from '@/redux/store'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { HandleSelectorComponentModes } from '@/types/interfaces'
import { useCallback, useEffect, useState } from 'react'

export const useHandleSelectorComponent = ({
  item,
  type,
  mode,
}: {
  item: unknown
  type: SelectorType
  mode?: HandleSelectorComponentModes
}) => {
  const [renderingItem, setRenderingItem] = useState<unknown>(item)

  const updateRenderingItem = useCallback((newValue: unknown) => {
    setRenderingItem(newValue)
  }, [])

  useEffect(() => {
    //item can be null and we don't want this block to run if item is null, thus we are doing the below check for item
    if (type === SelectorType.STATUS_SELECTOR && item) {
      store.dispatch(setCreateTaskFields({ targetField: 'workflowStateId', value: (item as WorkflowStateResponse)?.id }))
      store.dispatch(setCreateTemplateFields({ targetField: 'workflowStateId', value: (item as WorkflowStateResponse)?.id }))
    }

    setRenderingItem(item)
  }, [type, item])

  return {
    renderingItem,
    updateRenderingItem,
  }
}
