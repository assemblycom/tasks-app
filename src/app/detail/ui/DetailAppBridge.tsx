'use client'

import { Clickable, Icons } from '@/hooks/app-bridge/types'
import { useActionsMenu } from '@/hooks/app-bridge/useActionsMenu'
import { usePrimaryCta } from '@/hooks/app-bridge/usePrimaryCta'
import { useSecondaryCta } from '@/hooks/app-bridge/useSecondaryCta'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { setShowConfirmDeleteModal } from '@/redux/features/taskDetailsSlice'
import store from '@/redux/store'
import { useSelector } from 'react-redux'

interface DetailAppBridgeProps {
  isArchived: boolean
  handleToggleArchive: () => void
}

export const DetailAppBridge = ({ isArchived, handleToggleArchive }: DetailAppBridgeProps) => {
  const { workspace } = useSelector(selectAuthDetails)
  const portalUrl = workspace?.portalUrl
  const handleDelete = () => store.dispatch(setShowConfirmDeleteModal())

  usePrimaryCta(null, { portalUrl })
  useSecondaryCta(
    isArchived
      ? {
          label: 'Unarchive',
          icon: Icons.ARCHIVE,
          onClick: handleToggleArchive,
        }
      : null,
    { portalUrl },
  )

  const items: Clickable[] = [
    {
      label: 'Delete task',
      icon: Icons.TRASH,
      onClick: handleDelete,
      color: 'red',
    },
  ]
  if (!isArchived) {
    items.unshift({
      label: 'Archive task',
      icon: Icons.ARCHIVE,
      onClick: handleToggleArchive,
    })
  }

  useActionsMenu(items, { portalUrl })

  return <></>
}
