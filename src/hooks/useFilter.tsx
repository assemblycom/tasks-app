import { selectTaskBoard, setFilteredTasks } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { FilterOptions, FilterOptionsKeywords, IAssigneeCombined, IFilterOptions, UserIds } from '@/types/interfaces'
import { checkEmptyAssignee, getAssigneeName, UserIdsSchema, UserIdsType } from '@/utils/assignee'
import { useEffect, useTransition } from 'react'
import { useSelector } from 'react-redux'

interface KeywordMatchable {
  title?: string
  body?: string
  label?: string
  assigneeId?: string
  internalUserId?: string | null
  clientId?: string | null
  companyId?: string | null
}

const FilterFunctions = {
  [FilterOptions.ASSIGNEE]: filterByAssignee,
  [FilterOptions.CREATOR]: filterByCreator,
  [FilterOptions.ASSOCIATION]: filterByClientAssociation,
  [FilterOptions.IS_SHARED]: filterByClientAssociation,
  [FilterOptions.KEYWORD]: filterByKeyword,
  [FilterOptions.TYPE]: filterByType,
}

function filterByAssignee(filteredTasks: TaskResponse[], filterValue: UserIdsType): TaskResponse[] {
  const assigneeUserIds = filterValue

  if (checkEmptyAssignee(assigneeUserIds)) {
    return filteredTasks
  }
  const {
    [UserIds.INTERNAL_USER_ID]: internalUserId,
    [UserIds.CLIENT_ID]: clientId,
    [UserIds.COMPANY_ID]: companyId,
  } = assigneeUserIds

  if (internalUserId === 'No assignee') {
    //Change this when UserCompanySelector supports extra options for 'No assignee'
    filteredTasks = filteredTasks.filter((task) => !task.assigneeId)
  } else if (internalUserId) {
    filteredTasks = filteredTasks.filter((task) => task.internalUserId === internalUserId)
  } else if (clientId) {
    filteredTasks = filteredTasks.filter((task) => task.clientId === clientId && task.companyId === companyId)
  } else {
    filteredTasks = filteredTasks.filter((task) => task.companyId === companyId)
  }

  return filteredTasks
}

function filterByClientAssociation(
  filteredTasks: TaskResponse[],
  filterValue: UserIdsType,
  includeShared?: boolean,
): TaskResponse[] {
  const assigneeUserIds = filterValue

  if (checkEmptyAssignee(assigneeUserIds)) {
    return filteredTasks
  }
  const { [UserIds.CLIENT_ID]: clientId, [UserIds.COMPANY_ID]: companyId } = assigneeUserIds

  if (clientId) {
    filteredTasks = filteredTasks.filter((task) => {
      const isAssociated = task.associations?.[0]?.clientId === clientId && task.associations?.[0]?.companyId === companyId
      if (includeShared) return isAssociated && task.isShared

      return isAssociated
    })
  } else if (companyId && !clientId) {
    filteredTasks = filteredTasks.filter((task) => {
      const isAssociated = task.associations?.[0]?.companyId === companyId && !task.associations?.[0].clientId
      if (includeShared) return isAssociated && task.isShared

      return isAssociated
    })
  }

  return filteredTasks
}

function filterByCreator(filteredTasks: TaskResponse[], filterValue: UserIdsType): TaskResponse[] {
  const assigneeUserIds = filterValue

  if (checkEmptyAssignee(assigneeUserIds)) {
    return filteredTasks
  }
  const { [UserIds.INTERNAL_USER_ID]: internalUserId } = assigneeUserIds

  if (internalUserId) {
    filteredTasks = filteredTasks.filter((task) => task.createdById === internalUserId)
  }
  return filteredTasks
}

function filterByKeyword(
  filteredTasks: TaskResponse[],
  filterValue: string,
  accessibleTasks?: TaskResponse[],
  assignee?: IAssigneeCombined[],
): TaskResponse[] {
  const keyword = filterValue.toLowerCase()

  const assigneeNameMap = new Map(assignee?.map((a) => [a.id, getAssigneeName(a)?.toLowerCase() ?? '']) ?? [])

  const matchKeyword = (task: KeywordMatchable) => {
    const assigneeMatches = [task.assigneeId, task.companyId]
      .map((id) => assigneeNameMap.get(id || ''))
      .filter(Boolean)
      .some((name) => name && name.includes(keyword))

    return (
      task.title?.toLowerCase().includes(keyword) ||
      task.body?.toLowerCase().includes(keyword) ||
      task.label?.toLowerCase().includes(keyword) ||
      assigneeMatches
    )
  }

  const keywordMatchingParentIds = new Set(
    accessibleTasks
      ?.filter(matchKeyword)
      .map((task) => task.parentId)
      .filter(Boolean),
  )

  return filteredTasks.filter((task) => matchKeyword(task) || keywordMatchingParentIds.has(task.id))
}

function filterByType(filteredTasks: TaskResponse[], filterValue: string): TaskResponse[] {
  const assigneeType = filterValue

  switch (filterValue) {
    case FilterOptionsKeywords.CLIENTS:
      return filteredTasks.filter(
        (task) => task?.assigneeType?.includes('client') || task?.assigneeType?.includes('company'),
      )

    case FilterOptionsKeywords.CLIENT_WITH_VIEWERS:
      return filteredTasks.filter(
        (task) =>
          !!task?.associations?.length || task?.assigneeType?.includes('client') || task?.assigneeType?.includes('company'),
      )

    case FilterOptionsKeywords.TEAM:
      return filteredTasks.filter((task) => task?.assigneeType?.includes('internalUser'))

    case FilterOptionsKeywords.UNASSIGNED:
      return filteredTasks.filter((task) => !task.assigneeId)

    default:
      return filteredTasks.filter((task) => task.assigneeId == assigneeType)
  }
}

export const useFilter = (filterOptions: IFilterOptions, isPreviewMode: boolean) => {
  const { tasks, accessibleTasks, assignee } = useSelector(selectTaskBoard)
  const [_, startTransition] = useTransition()

  function applyFilter(tasks: TaskResponse[], filterOptions: IFilterOptions) {
    let filteredTasks = [...tasks]
    for (const [filterType, filterValue] of Object.entries(filterOptions)) {
      if (!filterValue) continue
      if (filterType === FilterOptions.ASSIGNEE && !isPreviewMode) {
        // there is no filter by assignee in preview mode
        const assigneeFilterValue = UserIdsSchema.parse(filterValue)
        filteredTasks = FilterFunctions[FilterOptions.ASSIGNEE](filteredTasks, assigneeFilterValue)
      }
      if (
        filterType === FilterOptions.CREATOR ||
        filterType === FilterOptions.ASSOCIATION ||
        filterType === FilterOptions.IS_SHARED
      ) {
        let includeShared = false
        if (filterType === FilterOptions.IS_SHARED) {
          includeShared = true
        }
        const assigneeFilterValue = UserIdsSchema.parse(filterValue)
        filteredTasks = FilterFunctions[filterType](filteredTasks, assigneeFilterValue, includeShared)
      }
      if (filterType === FilterOptions.KEYWORD) {
        filteredTasks = FilterFunctions[FilterOptions.KEYWORD](
          filteredTasks,
          filterValue as string,
          accessibleTasks,
          assignee,
        )
      }
      if (filterType === FilterOptions.TYPE) {
        filteredTasks = FilterFunctions[FilterOptions.TYPE](filteredTasks, filterValue as string)
      }
    }
    startTransition(() => {
      store.dispatch(setFilteredTasks(filteredTasks))
    })
  }

  useEffect(() => {
    applyFilter(tasks, filterOptions)
  }, [tasks, filterOptions])
}
