import { CopilotAPI } from '@/utils/CopilotAPI'
import { WorkspaceResponse } from '@/types/common'
import { cache } from 'react'

export const getMemoizedWorkspace = cache(async (token: string): Promise<WorkspaceResponse> => {
  const copilot = new CopilotAPI(token)
  return copilot.getWorkspace()
})
