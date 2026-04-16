/**
 * All utils related to the Copilot selector component
 */

import { IAssigneeCombined, InputValue, ISelectorOption, UserIds } from '@/types/interfaces'
import { userIdFieldMap } from '@/types/objectMaps'
import { UserIdsType } from './assignee'
import { TaskResponse, Associations } from '@/types/dto/tasks.dto'
import { UserRole } from '@/app/api/core/types/user'
import { z } from 'zod'

export const getSelectedUserIds = (inputValue: InputValue[]): UserIdsType => {
  let userIds: UserIdsType = {
    [UserIds.INTERNAL_USER_ID]: null,
    [UserIds.CLIENT_ID]: null,
    [UserIds.COMPANY_ID]: null,
  }
  if (!inputValue?.length) {
    return userIds
  } // when no user is selected.

  const newValue = inputValue[0] //done to support single selection only, once the UserCompanySelector component supports single selection, this logic will need to be updated.
  const activeKey = userIdFieldMap[newValue.object as keyof typeof userIdFieldMap]
  userIds = {
    [UserIds.INTERNAL_USER_ID]: null,
    [UserIds.CLIENT_ID]: null,
    [UserIds.COMPANY_ID]: null,
    [activeKey]: newValue.id,
  }
  if (newValue.companyId) {
    userIds[UserIds.COMPANY_ID] = newValue.companyId
  }

  return userIds
}

export const selectorOptionsToInputValue = (options: ISelectorOption[]): InputValue[] =>
  options.map((option) => ({
    id: option.value,
    object: option.type,
    companyId: option.companyId,
  }))

export const getSelectorAssignee = (assignee: IAssigneeCombined[], inputValue: InputValue[]) => {
  return assignee.find((assignee) =>
    inputValue[0]?.companyId
      ? assignee.id === inputValue[0]?.id && assignee.companyId === inputValue[0]?.companyId
      : assignee.id === inputValue[0]?.id,
  )
}

export const getSelectorAssigneeFromTask = (assignee: IAssigneeCombined[], task: TaskResponse) => {
  if (!task) return undefined
  return assignee.find((assignee) =>
    task?.clientId
      ? assignee.id == task?.assigneeId && assignee.companyId == task?.companyId
      : assignee.id == task?.assigneeId,
  )
} //util to get initial assignee from task for selector.

export const getSelectorAssociationFromTask = (assignee: IAssigneeCombined[], task: TaskResponse) => {
  if (!task) return undefined
  return assignee.find(
    (assignee) =>
      (task.associations?.[0]?.clientId == assignee.id && task.associations?.[0]?.companyId == assignee.companyId) ||
      task.associations?.[0]?.companyId == assignee.id,
  )
}

export const getSelectorAssigneeFromFilterOptions = (
  assignee: IAssigneeCombined[],
  assigneeFilterOptions: UserIdsType,
  typeFilterOptions?: string,
) => {
  return assignee.find(
    (item) =>
      item.id == assigneeFilterOptions[UserIds.INTERNAL_USER_ID] ||
      (item.id == assigneeFilterOptions[UserIds.CLIENT_ID] && item.companyId == assigneeFilterOptions[UserIds.COMPANY_ID]) ||
      item.id == assigneeFilterOptions[UserIds.COMPANY_ID] ||
      (typeFilterOptions && item.id == typeFilterOptions),
  )
} //util to get initial assignee from filterOptions for selector.

export const getSelectedViewerIds = (inputValue: InputValue[]): Associations => {
  if (!inputValue?.length || inputValue[0].object === UserRole.IU) return [] // when no user is selected.

  if (inputValue[0].object === UserRole.Client)
    return [{ clientId: inputValue[0].id, companyId: z.string().parse(inputValue[0].companyId) }] // currently id of single client id

  return [{ companyId: inputValue[0].id }]
}
