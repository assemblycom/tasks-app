'use client'

import { setTokenPayload, setWorkspace } from '@/redux/features/authDetailsSlice'
import {
  selectTaskBoard,
  setAccessibleTasks,
  setAssigneeList,
  setFilteredAssigneeList,
  setPreviewMode,
  setTasks,
  setClientViewLocks,
  setToken,
  setUrlActionParams,
  setViewSettings,
  setWorkflowStates,
} from '@/redux/features/taskBoardSlice'
import { setAssigneeSuggestion, setExpandedComments } from '@/redux/features/taskDetailsSlice'
import { selectCreateTemplate, setTemplates } from '@/redux/features/templateSlice'
import store from '@/redux/store'
import { Token, UrlActionParamsType, WorkspaceResponse } from '@/types/common'
import { HomeParamActions } from '@/types/constants'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { ViewSettingsResponse } from '@/types/dto/viewSettings.dto'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { FilterOptionsKeywords, IAssigneeCombined, IAssigneeSuggestions, ITemplate } from '@/types/interfaces'
import { filterOptionsMap } from '@/types/objectMaps'
import { getPreviewMode, handlePreviewMode } from '@/utils/previewMode'
import { ReactNode, useEffect } from 'react'
import { useSelector } from 'react-redux'

type ClientSideStateUpdateProps = {
  children: ReactNode
  workflowStates?: WorkflowStateResponse[]
  tasks?: TaskResponse[]
  assignee?: IAssigneeCombined[]
  viewSettings?: ViewSettingsResponse
  token?: string
  tokenPayload?: Token | null
  templates?: ITemplate[]
  assigneeSuggestions?: IAssigneeSuggestions[]
  clearExpandedComments?: boolean
  accessibleTasks?: TaskResponse[]
  workspace?: WorkspaceResponse
} & UrlActionParamsType

export const ClientSideStateUpdate = ({
  children,
  workflowStates,
  tasks,
  assignee,
  token,
  viewSettings,
  tokenPayload,
  templates,
  assigneeSuggestions,
  clearExpandedComments,
  accessibleTasks,
  workspace,
  action,
  pf,
}: ClientSideStateUpdateProps) => {
  const {
    tasks: tasksInStore,
    viewSettingsTemp,
    accessibleTasks: accessibleTaskInStore,
    activeTask: activeTaskInStore,
  } = useSelector(selectTaskBoard)
  const { templates: templatesInStore } = useSelector(selectCreateTemplate)

  useEffect(() => {
    if (workflowStates) {
      store.dispatch(setWorkflowStates(workflowStates))
    }

    if (tasks && tasksInStore.length === 0) {
      store.dispatch(setTasks(tasks))
    }

    if (token) {
      store.dispatch(setToken(token))
    }

    if (assignee) {
      store.dispatch(setAssigneeList(assignee))
    }

    if (action && action === HomeParamActions.CREATE_TASK) {
      store.dispatch(setUrlActionParams({ action, pf }))
    }

    if (viewSettings) {
      const viewSettingsCopy = viewSettingsTemp ? structuredClone(viewSettingsTemp) : structuredClone(viewSettings) //deep cloning for immutability and prevent the reducer mutating the original object.
      const previewMode = tokenPayload && !!getPreviewMode(tokenPayload)
      if (previewMode && !viewSettingsCopy.filterOptions.type) {
        viewSettingsCopy.filterOptions.type = FilterOptionsKeywords.CLIENTS
      }
      store.dispatch(setViewSettings(viewSettingsCopy))
      store.dispatch(setClientViewLocks(viewSettings.clientLocks ?? { viewMode: false, showSubtasks: false }))
      const view = viewSettingsTemp ? viewSettingsTemp.filterOptions : viewSettingsCopy.filterOptions
      store.dispatch(
        setFilteredAssigneeList({
          filteredType:
            filterOptionsMap[view?.type] || (previewMode ? FilterOptionsKeywords.CLIENTS : filterOptionsMap.default),
        }),
      )
    }

    if (tokenPayload) {
      store.dispatch(setTokenPayload(tokenPayload))

      // Handle preview mode feature
      const previewMode = getPreviewMode(tokenPayload)
      store.dispatch(setPreviewMode(previewMode))

      previewMode && handlePreviewMode(tokenPayload)
    }

    if (templates && templatesInStore.length === 0) {
      store.dispatch(setTemplates(templates))
    }

    if (assigneeSuggestions) {
      store.dispatch(setAssigneeSuggestion(assigneeSuggestions))
    }

    if (clearExpandedComments) {
      store.dispatch(setExpandedComments([]))
    }

    if (accessibleTasks) {
      const accessibleTaskData = accessibleTaskInStore.length ? accessibleTaskInStore : accessibleTasks
      store.dispatch(setAccessibleTasks(accessibleTaskData))
    }

    if (workspace) {
      store.dispatch(setWorkspace(workspace))
    }
  }, [workflowStates, tasks, token, assignee, viewSettings, tokenPayload, templates, assigneeSuggestions, accessibleTasks])

  return children
}
