import { IAssignee, IAssigneeCombined, ISelectorOption } from '@/types/interfaces'
import { getAssigneeName } from '@/utils/assignee'
import { AssigneeType } from '@prisma/client'

export type ObjectType = 'client' | 'internalUser' | 'company'

export function addTypeToAssignee(assignee?: IAssignee): IAssigneeCombined[] {
  if (!assignee) return []

  const combined: IAssigneeCombined[] = []

  if (assignee.clients) {
    combined.push(
      ...assignee.clients.flatMap((client) => {
        if (client.companyIds.length === 0) {
          return [
            {
              ...client,
              type: 'clients' as const,
              companyId: '',
            },
          ]
        }

        return client.companyIds.map((companyId) => ({
          ...client,
          companyId,
          type: 'clients' as const,
        }))
      }),
    )
  }

  if (assignee.internalUsers) {
    combined.push(
      ...assignee.internalUsers.map((user) => ({
        ...user,
        type: 'internalUsers' as const,
      })),
    )
  }

  if (assignee.ius) {
    combined.push(
      ...assignee.ius.map((ius) => ({
        ...ius,
        type: 'ius' as const,
      })),
    )
  }

  if (assignee.companies) {
    combined.push(
      ...assignee.companies.map((company) => ({
        ...company,
        type: 'companies' as const,
      })),
    )
  }

  return combined
} //also flattens the client list.

export function parseAssigneeToSelectorOption(assignees?: IAssigneeCombined[]): {
  clients: ISelectorOption[]
  internalUsers: ISelectorOption[]
  companies: ISelectorOption[]
} {
  const result: {
    clients: ISelectorOption[]
    internalUsers: ISelectorOption[]
    companies: ISelectorOption[]
  } = {
    clients: [],
    internalUsers: [],
    companies: [],
  }
  if (!assignees) return result

  assignees.forEach((item) => {
    const optionBase = {
      value: item.id,
      label: getAssigneeName(item),
      avatarSrc: item.avatarImageUrl || item.iconImageUrl || undefined,
      avatarFallbackColor: item.fallbackColor,

      companyId: item.companyId,
    }

    if (item.type === 'clients') {
      result.clients.push({ ...optionBase, type: AssigneeType.client })
    } else if (item.type === 'internalUsers') {
      result.internalUsers.push({ ...optionBase, type: AssigneeType.internalUser })
    } else if (item.type === 'companies') {
      result.companies.push({ ...optionBase, type: AssigneeType.company })
    }
  })
  return result
}
