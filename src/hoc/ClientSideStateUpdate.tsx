'use client'

import { setTokenPayload, setWorkspace } from '@/redux/features/authDetailsSlice'
import {
  selectTaskBoard,
  setAccesibleTaskIds,
  setAccessibleTasks,
  setAssigneeList,
  setFilteredAssigneeList,
  setPreviewMode,
  setTasks,
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
import { CreateViewSettingsDTO } from '@/types/dto/viewSettings.dto'
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
  viewSettings?: CreateViewSettingsDTO
  token?: string
  tokenPayload?: Token | null
  templates?: ITemplate[]
  assigneeSuggestions?: IAssigneeSuggestions[]
  clearExpandedComments?: boolean
  accesibleTaskIds?: string[]
  accessibleTasks?: TaskResponse[]
  workspace?: WorkspaceResponse
} & UrlActionParamsType

/**
 * Updates client-side Redux state from server-fetched props.
 *
 * `activeTask` and `activeTemplate` are handled by dedicated `SeedActiveTask`
 * / `SeedActiveTemplate` components — they have stricter lifecycle requirements
 * (race-safe reconcile, scoped cleanup) that the umbrella effect can't provide.
 */
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
  accesibleTaskIds,
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

  // Self-healing guard for `activeTask`. Under React 18 concurrent rendering,
  // the unmount cleanup below (or a stale cleanup from a previous mount) can
  // land AFTER this component's mount effect, leaving `activeTask` undefined
  // even though the SSR-rendered `task` prop is defined — Sidebar then sticks
  // on the loading skeleton because its gate is `!activeTask || !isHydrated`.
  // We can't safely drop the cleanup (other navigation flows depend on it),
  // so we re-sync whenever a task prop is present but Redux drifted away.
  // Idempotent: once `activeTaskInStore.id === task.id`, this effect no-ops.
  useEffect(() => {
    if (task && (!activeTaskInStore || activeTaskInStore.id !== task.id)) {
      store.dispatch(setActiveTask(task))
    }
  }, [task, activeTaskInStore])

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

    if (accesibleTaskIds) {
      store.dispatch(setAccesibleTaskIds(accesibleTaskIds))
    }

    if (accessibleTasks) {
      const accessibleTaskData = accessibleTaskInStore.length ? accessibleTaskInStore : accessibleTasks
      store.dispatch(setAccessibleTasks(accessibleTaskData))
    }

    if (workspace) {
      store.dispatch(setWorkspace(workspace))
    }
  }, [
    workflowStates,
    tasks,
    token,
    assignee,
    viewSettings,
    tokenPayload,
    templates,
    assigneeSuggestions,
    accesibleTaskIds,
    accessibleTasks,
  ])

  return children
}
