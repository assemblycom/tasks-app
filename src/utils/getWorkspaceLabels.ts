import { WorkspaceResponse } from '@/types/common'

export type WorkspaceLabels = {
  individualTerm: string
  individualTermPlural: string
  groupTerm: string
  groupTermPlural: string
}

export const getWorkspaceLabels = (workspace?: WorkspaceResponse, shouldCapitalize: boolean = false): WorkspaceLabels => {
  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)
  const deCapitalize = (str: string) => str.charAt(0).toLowerCase() + str.slice(1)

  const format = (value: string | undefined, fallback: string) => {
    if (!value) return shouldCapitalize ? capitalize(fallback) : deCapitalize(fallback)
    return shouldCapitalize ? capitalize(value) : deCapitalize(value)
  }

  return {
    individualTerm: format(workspace?.labels?.individualTerm, 'client'),
    individualTermPlural: format(workspace?.labels?.individualTermPlural, 'clients'),
    groupTerm: format(workspace?.labels?.groupTerm, 'company'),
    groupTermPlural: format(workspace?.labels?.groupTermPlural, 'companies'),
  }
}
