import { WorkspaceResponse } from '@/types/common'
import { DefaultUserLabels, IAssigneeCombined } from '@/types/interfaces'
import { getWorkspaceLabels } from '@/utils/getWorkspaceLabels'
import { useEffect, useMemo, useState } from 'react'

export const useAssociationLabelForWorkspace = ({
  workspace,
  associationValue,
}: {
  workspace?: WorkspaceResponse
  associationValue: IAssigneeCombined | null
}) => {
  const [associationLabel, setAssociationLabel] = useState<string>(DefaultUserLabels.Client)

  const workspaceLabels = useMemo(() => {
    return getWorkspaceLabels(workspace)
  }, [workspace])

  useEffect(() => {
    const label = associationValue?.type === 'clients' ? workspaceLabels.individualTerm : workspaceLabels.groupTerm
    setAssociationLabel(label)
  }, [workspaceLabels, associationValue])

  return { associationLabel }
}
