export const fetchCache = 'force-no-store'

import { AssigneeCacheSetter } from '@/app/_cache/AssigneeCacheSetter'
import { fetchWithErrorHandler } from '@/app/_fetchers/fetchWithErrorHandler'
import { apiUrl } from '@/config'
import { MAX_FETCH_ASSIGNEE_COUNT } from '@/constants/users'
import { ClientSideStateUpdate } from '@/hoc/ClientSideStateUpdate'
import { Token } from '@/types/common'
import { TaskResponse } from '@/types/dto/tasks.dto'
import { CreateViewSettingsDTO } from '@/types/dto/viewSettings.dto'
import { IAssignee, PropsWithToken, UserType } from '@/types/interfaces'
import { addTypeToAssignee } from '@/utils/addTypeToAssignee'

interface AssigneeFetcherProps extends PropsWithToken {
  viewSettings?: CreateViewSettingsDTO
  userType?: UserType
  isPreview?: boolean
  task?: TaskResponse
  tokenPayload?: Token
}

const fetchAssignee = async (token: string, userType?: UserType, isPreview?: boolean): Promise<IAssignee> => {
  if (userType === UserType.CLIENT_USER && !isPreview) {
    const data = await fetchWithErrorHandler<{ clients: IAssignee }>(
      `${apiUrl}/api/users/client?token=${token}&limit=${MAX_FETCH_ASSIGNEE_COUNT}`,
      {
        next: { tags: ['getAssigneeList'] },
      },
    )

    return data.clients
  }

  const data = await fetchWithErrorHandler<{ users: IAssignee }>(
    `${apiUrl}/api/users?token=${token}&limit=${MAX_FETCH_ASSIGNEE_COUNT}`,
    {
      next: { tags: ['getAssigneeList'] },
    },
  )
  return data.users
}
export const AssigneeFetcher = async ({
  token,
  userType,
  viewSettings,
  isPreview,
  task,
  tokenPayload,
}: AssigneeFetcherProps) => {
  const fetchedAssignee = await fetchAssignee(token, userType, isPreview)

  const assignableUsersWithType = addTypeToAssignee(fetchedAssignee)

  const { internalUserId, clientId, companyId } = tokenPayload || {}

  return (
    <ClientSideStateUpdate assignee={assignableUsersWithType} viewSettings={viewSettings} task={task}>
      {(internalUserId || (clientId && companyId)) && (
        <AssigneeCacheSetter
          lookupKey={clientId && companyId ? `${clientId!}.${companyId!}` : internalUserId!}
          assignee={assignableUsersWithType}
        />
      )}
    </ClientSideStateUpdate>
  )
}
