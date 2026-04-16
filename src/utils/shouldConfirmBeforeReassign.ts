import { InternalUsersSchema } from '@/types/common'
import { IAssigneeCombined } from '@/types/interfaces'
import { getAssigneeTypeCorrected } from '@/utils/getAssigneeTypeCorrected'
import { AssigneeType } from '@prisma/client'
import { z } from 'zod'

export const shouldConfirmBeforeReassignment = (
  previousAssignee?: IAssigneeCombined,
  currentAssignee?: IAssigneeCombined,
) => {
  if (!currentAssignee || !previousAssignee) {
    return false // donot show confirmation modal for now if there is no previous assignee. Most likely we should set this to true when no assignee option is implemented.
  }

  const currentAssigneeType = getAssigneeTypeCorrected(currentAssignee)
  const previousAssigneeCompanyAccessList = getPreviousCompanyList(previousAssignee)
  const previousAssigneeType = getAssigneeTypeCorrected(previousAssignee)
  if (
    (!previousAssigneeCompanyAccessList.length && previousAssigneeType == AssigneeType.internalUser) ||
    previousAssignee.id == currentAssignee.id //might be the same client with different company
  ) {
    return false
  } // case when previous assignee is an IU with full access to clients.

  switch (currentAssigneeType) {
    case AssigneeType.client:
      return !previousAssigneeCompanyAccessList.includes(z.string().parse(currentAssignee.companyId))

    case AssigneeType.company:
      return !previousAssigneeCompanyAccessList.includes(currentAssignee.id)

    default:
      return false
  }
}

export const shouldConfirmTaskSharedBeforeReassignment = (
  association: IAssigneeCombined | null,
  isTaskShared: boolean,
  currentAssignee?: IAssigneeCombined,
) => {
  if (association && isTaskShared) {
    const assigneeType = currentAssignee && getAssigneeTypeCorrected(currentAssignee)
    if (!assigneeType || (assigneeType !== AssigneeType.internalUser && currentAssignee.id !== association.id)) {
      //no assignee or assignee is a non-IU
      return true
    }
  }
  return false
}

const getPreviousCompanyList = (previousAssignee: IAssigneeCombined) => {
  const previousCompanyList: string[] = []
  const previousAssigneeType = getAssigneeTypeCorrected(previousAssignee)

  switch (previousAssigneeType) {
    case AssigneeType.internalUser:
      const previousIU = InternalUsersSchema.parse(previousAssignee)
      if (previousIU.isClientAccessLimited) {
        previousCompanyList.push(...(previousIU?.companyAccessList || []))
        return previousCompanyList
      }

    case AssigneeType.client:
      if (previousAssignee.companyId) {
        previousCompanyList.push(previousAssignee.companyId)
      }
      return previousCompanyList

    case AssigneeType.company:
      previousCompanyList.push(previousAssignee.id)
      return previousCompanyList

    default:
      return previousCompanyList
  }
}
