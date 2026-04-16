import { selectTaskBoard, setFilteredTasks, updateFilterOption } from '@/redux/features/taskBoardSlice'
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

function filterByClientAssociation(filteredTasks: TaskResponse[], filterValue: UserIdsType): TaskResponse[] {
  const assigneeUserIds = filterValue

  if (checkEmptyAssignee(assigneeUserIds)) {
    return filteredTasks
  }
  const { [UserIds.CLIENT_ID]: clientId, [UserIds.COMPANY_ID]: companyId } = assigneeUserIds

  if (clientId) {
    filteredTasks = filteredTasks.filter((task) => {
      return task.associations?.[0]?.clientId === clientId && task.associations?.[0]?.companyId === companyId
    })
  } else if (companyId && !clientId) {
    filteredTasks = filteredTasks.filter((task) => {
      return task.associations?.[0]?.companyId === companyId && !task.associations?.[0].clientId
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
  const { tasks, accessibleTasks, assignee, showArchived, showUnarchived } = useSelector(selectTaskBoard)
  const [_, startTransition] = useTransition()

  function applyFilters(tasks: TaskResponse[], filterOptions: IFilterOptions) {
    let filteredTasks = [...tasks]
    for (const [filterType, filterValue] of Object.entries(filterOptions)) {
      if (!filterValue) continue
      filteredTasks = applyOneFilter(filteredTasks, filterType, filterValue)
    }
    return filteredTasks
  }

  function applyOneFilter(tasks: TaskResponse[], filterType: string, filterValue: unknown): TaskResponse[] {
    if (filterType === FilterOptions.ASSIGNEE && !isPreviewMode) {
      const assigneeFilterValue = UserIdsSchema.parse(filterValue)
      return FilterFunctions[FilterOptions.ASSIGNEE](tasks, assigneeFilterValue)
    }
    if (filterType === FilterOptions.CREATOR || filterType === FilterOptions.ASSOCIATION) {
      const assigneeFilterValue = UserIdsSchema.parse(filterValue)
      return FilterFunctions[filterType](tasks, assigneeFilterValue)
    }
    if (filterType === FilterOptions.KEYWORD) {
      return FilterFunctions[FilterOptions.KEYWORD](tasks, filterValue as string, accessibleTasks, assignee)
    }
    if (filterType === FilterOptions.TYPE) {
      return FilterFunctions[FilterOptions.TYPE](tasks, filterValue as string)
    }
    return tasks
  }

  function applyFilter(tasks: TaskResponse[], filterOptions: IFilterOptions) {
    const filteredParentTasks = applyFilters(tasks, filterOptions)
    const filteredParentIds = new Set(filteredParentTasks.map((t) => t.id))

    // Find subtasks that match all filters but whose parent didn't
    const hasActiveFilter = Object.values(filterOptions).some((v) => !!v)
    let standaloneSubtasks: TaskResponse[] = []

    if (hasActiveFilter) {
      const subtasks = accessibleTasks.filter((t) => !!t.parentId && (t.isArchived ? showArchived : showUnarchived))
      const matchingSubtasks = applyFilters(subtasks, filterOptions)
      standaloneSubtasks = matchingSubtasks.filter((t) => !filteredParentIds.has(t.parentId!))
    }

    const filteredTasks = [...filteredParentTasks, ...standaloneSubtasks]

    startTransition(() => {
      store.dispatch(setFilteredTasks(filteredTasks))
    })
  }

  useEffect(() => {
    applyFilter(tasks, filterOptions)
  }, [tasks, accessibleTasks, filterOptions])

  useEffect(() => {
    if (assignee?.length) {
      store.dispatch(updateFilterOption({ filterOptions }))
    }
  }, [assignee])
}
