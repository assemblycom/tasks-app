import { updateViewModeSettings } from '@/app/(home)/actions'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { selectTaskBoard, setFilterOptions, setViewSettingsTemp } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { IUTokenSchema } from '@/types/common'
import { CreateViewSettingsDTO } from '@/types/dto/viewSettings.dto'
import { FilterOptions, FilterOptionsKeywords, IFilterOptions } from '@/types/interfaces'
import { emptyAssignee, UserIdsType } from '@/utils/assignee'
import { getWorkspaceLabels } from '@/utils/getWorkspaceLabels'
import { useSelector } from 'react-redux'
import z from 'zod'

export const useFilterBar = () => {
  const { token, view, viewSettingsTemp, showArchived, showUnarchived, showSubtasks } = useSelector(selectTaskBoard)
  const { tokenPayload, workspace } = useSelector(selectAuthDetails)

  const updateViewModeSetting = async (payload: CreateViewSettingsDTO) => {
    try {
      await updateViewModeSettings(z.string().parse(token), payload)
    } catch (error) {
      console.error('view settings update error', error)
    }
  }

  const handleFilterOptionsChange = async (optionType: FilterOptions, newValue: string | null | UserIdsType) => {
    store.dispatch(setFilterOptions({ optionType, newValue }))
    //FilteredAssignee is also updated in the component's state and used in Selector's autocomplete to mitigate the time taken to update the store and fetch values to the Selector's autocomplete.
    const updatedFilterOptions = viewSettingsTemp
      ? (store.getState().taskBoard.viewSettingsTemp?.filterOptions as IFilterOptions)
      : store.getState().taskBoard.filterOptions

    store.dispatch(
      setViewSettingsTemp({
        viewMode: view,
        filterOptions: { ...updatedFilterOptions, [optionType]: newValue },
        showArchived: showArchived,
        showUnarchived: showUnarchived,
        showSubtasks: showSubtasks,
      }),
    )
    updateViewModeSetting({
      viewMode: view,
      filterOptions: {
        ...updatedFilterOptions,
        [optionType]: newValue,
      },
      showArchived: showArchived,
      showUnarchived: showUnarchived,
      showSubtasks: showSubtasks,
    })
  }

  const handleFilterTypeClick = ({ filterTypeValue }: { filterTypeValue: string | null | UserIdsType }) => {
    handleFilterOptionsChange(FilterOptions.TYPE, filterTypeValue)
    handleFilterOptionsChange(FilterOptions.ASSIGNEE, emptyAssignee)
  }

  const iuFilterButtons = [
    {
      name: 'Me',
      onClick: () => handleFilterTypeClick({ filterTypeValue: IUTokenSchema.parse(tokenPayload).internalUserId }),
      id: 'MyTasks',
    },
    {
      name: 'Team',
      onClick: () => handleFilterTypeClick({ filterTypeValue: FilterOptionsKeywords.TEAM }),
      id: 'TeamTasks',
    },
    {
      name: `${getWorkspaceLabels(workspace, true).individualTerm}`,
      onClick: () => handleFilterTypeClick({ filterTypeValue: FilterOptionsKeywords.CLIENTS }),
      id: 'ClientTasks',
    },
    {
      name: 'Unassigned',
      onClick: () => handleFilterTypeClick({ filterTypeValue: FilterOptionsKeywords.UNASSIGNED }),
      id: 'UnassignedTasks',
    },
    {
      name: 'All',
      onClick: () => handleFilterTypeClick({ filterTypeValue: '' }),
      id: 'AllTasks',
    },
  ]

  const clientFilterButtons = [
    {
      name: 'All',
      onClick: () => handleFilterTypeClick({ filterTypeValue: FilterOptionsKeywords.CLIENT_WITH_VIEWERS }),
      id: 'AllTasks',
    },
    {
      name: 'Me',
      onClick: () => handleFilterTypeClick({ filterTypeValue: FilterOptionsKeywords.CLIENTS }),
      id: 'MyTasks',
    },
  ]

  const previewFilterButtons = [
    {
      name: 'Me',
      onClick: () => {
        handleFilterTypeClick({ filterTypeValue: IUTokenSchema.parse(tokenPayload).internalUserId })
      },
      id: 'MyTasks',
    },
    {
      name: 'Team',
      onClick: () => handleFilterTypeClick({ filterTypeValue: FilterOptionsKeywords.TEAM }),
      id: 'TeamTasks',
    },
    {
      name: 'Unassigned',
      onClick: () => handleFilterTypeClick({ filterTypeValue: FilterOptionsKeywords.UNASSIGNED }),
      id: 'UnassignedTasks',
    },
    {
      name: `${getWorkspaceLabels(workspace, true).individualTerm}`,
      onClick: () => handleFilterTypeClick({ filterTypeValue: FilterOptionsKeywords.CLIENTS }),
      id: 'ClientTasks',
    },
  ]

  return { updateViewModeSetting, handleFilterOptionsChange, iuFilterButtons, clientFilterButtons, previewFilterButtons }
}
