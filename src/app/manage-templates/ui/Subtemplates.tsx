'use client'

import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { selectCreateTemplate } from '@/redux/features/templateSlice'
import { CreateTemplateRequest } from '@/types/dto/templates.dto'
import { ITemplate } from '@/types/interfaces'
import { requireLiveToken } from '@/utils/assemblyTokenStore'
import { generateRandomString } from '@/utils/generateRandomString'
import { getTempTaskTemplate } from '@/utils/optimisticTaskUtils'
import { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'

import { AddBtn } from '@/components/buttons/AddBtn'
import { GhostBtn } from '@/components/buttons/GhostBtn'
import { GrayAddMediumIcon } from '@/icons'
import { fetcher } from '@/utils/fetcher'
import { checkOptimisticStableId } from '@/utils/optimisticCommentUtils'
import { sortTaskByDescendingOrder } from '@/utils/sortByDescending'
import { Box, Stack, Typography } from '@mui/material'
import useSWR, { useSWRConfig } from 'swr'
import { createSubTemplate } from '@/app/manage-templates/actions'
import { NewTemplateCard } from '@/app/manage-templates/ui/NewTemplateCard'
import { SubtemplatesList } from '@/app/manage-templates/ui/SubtemplatesList'
import { useDebounce } from '@/hooks/useDebounce'

interface OptimisticUpdate {
  tempId: string
  serverId?: string
  timestamp: number
}

export const Subtemplates = ({ template_id }: { template_id: string }) => {
  const [openTaskForm, setOpenTaskForm] = useState(false)
  const { workflowStates } = useSelector(selectTaskBoard)
  const { activeTemplate } = useSelector(selectCreateTemplate)
  const { tokenPayload } = useSelector(selectAuthDetails)
  const [optimisticUpdates, setOptimisticUpdates] = useState<OptimisticUpdate[]>([])

  const handleFormCancel = () => setOpenTaskForm(false)
  const handleFormOpen = () => setOpenTaskForm(!openTaskForm)

  const canCreateSubtemplates = !activeTemplate?.parentId

  // Stable cache key — fetcher injects the live token at request time.
  const cacheKey = `/api/tasks/templates/${template_id}/sub-templates`

  const { data: subtemplates } = useSWR(cacheKey, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: false,
  })

  const didMount = useRef(false)
  const shouldRefetchRef = useRef(true)

  const { mutate } = useSWRConfig()

  const _debounceMutate = async (cacheKey: string) => await mutate(cacheKey)
  const debounceMutate = useDebounce(_debounceMutate, 200)

  useEffect(() => {
    if (!activeTemplate) return
    if (!didMount.current || !shouldRefetchRef.current) {
      didMount.current = true
      shouldRefetchRef.current = true

      return //skip the refetch on first mount and shouldRefetch is false.
    }

    debounceMutate(cacheKey)
  }, [activeTemplate?.subTaskTemplates])

  const handleSubtemplateCreation = (payload: CreateTemplateRequest) => {
    const tempId = generateRandomString('temp-template')
    setOptimisticUpdates((prev) => [
      ...prev,
      {
        tempId,
        timestamp: Date.now(),
      },
    ])

    const tempSubtemplate: ITemplate = getTempTaskTemplate(
      tempId,
      payload,
      tokenPayload?.workspaceId ?? '',
      tokenPayload?.internalUserId ?? '',
      template_id,
    )

    const currentSubtemplates = subtemplates?.data || []
    const optimisticData = sortTaskByDescendingOrder([...currentSubtemplates, tempSubtemplate])

    try {
      mutate(
        cacheKey,
        async () => {
          const subTask = await createSubTemplate(requireLiveToken(), template_id, payload)
          setOptimisticUpdates((prev) =>
            prev.map((update) => (update.tempId === tempId ? { ...update, serverId: subTask.id } : update)),
          )
          return await fetcher(cacheKey)
        },
        {
          optimisticData: { data: optimisticData },
          rollbackOnError: true,
          revalidate: false,
        },
      )
    } catch (error) {
      console.error('Failed to create subtemplate:', error)
      setOptimisticUpdates((prev) => prev.filter((update) => update.tempId !== tempId))
    }
  }

  return (
    <Stack
      direction="column"
      rowGap={'8px'}
      width="100%"
      sx={{ padding: !canCreateSubtemplates && subtemplates?.data?.length == 0 ? '0px' : '24px 0px 0px' }}
    >
      {canCreateSubtemplates && (
        <>
          {subtemplates && subtemplates?.data?.length > 0 ? (
            <Stack
              direction="row"
              sx={{
                display: 'flex',
                height: '32px',
                justifyContent: 'space-between',
                alignItems: 'center',
                alignSelf: 'stretch',
              }}
            >
              <Typography variant="lg">Subtasks</Typography>

              <AddBtn handleClick={handleFormOpen} />
            </Stack>
          ) : subtemplates ? (
            // If subtemplates has been loaded but task length is empty, show button
            <GhostBtn buttonText="Create subtask" handleClick={handleFormOpen} startIcon={<GrayAddMediumIcon />} />
          ) : (
            // If subtemplates list hasn't been rendered
            <></>
          )}
        </>
      )}
      {!canCreateSubtemplates && subtemplates && subtemplates?.data?.length > 0 && (
        <Stack
          direction="row"
          sx={{
            display: 'flex',
            height: '32px',
            justifyContent: 'space-between',
            alignItems: 'center',
            alignSelf: 'stretch',
          }}
        >
          <Typography variant="lg">Subtasks</Typography>
        </Stack>
      )}

      {openTaskForm && <NewTemplateCard handleClose={handleFormCancel} handleCreate={handleSubtemplateCreation} />}

      <Box>
        {subtemplates?.data?.map((item: ITemplate) => {
          const isTempId = item.id.includes('temp')

          return (
            <SubtemplatesList isTemp={isTempId} key={checkOptimisticStableId(item, optimisticUpdates)} template={item} />
          )
        })}
      </Box>
    </Stack>
  )
}
