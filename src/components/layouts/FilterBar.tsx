'use client'

import { IconBtn } from '@/components/buttons/IconBtn'
import FilterButtonGroup from '@/components/buttonsGroup/FilterButtonsGroup'
import { DisplaySelector } from '@/components/inputs/DisplaySelector'
import SearchBar from '@/components/searchBar'
import { useFilterBar } from '@/hooks/useFilterBar'
import { AddLargeIcon } from '@/icons'
import { setShowModal } from '@/redux/features/createTaskSlice'
import { selectTaskBoard, setIsTasksLoading, setViewSettings, setViewSettingsTemp } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'
import { DisplayOptions } from '@/types/dto/viewSettings.dto'
import { FilterOptions, IFilterOptions } from '@/types/interfaces'
import {
  clientFilterTypeToButtonIndexMap,
  filterTypeToButtonIndexMap,
  previewFilterTypeToButtonIndexMap,
} from '@/types/objectMaps'
import { UserRole } from '@api/core/types/user'
import { Box, Stack } from '@mui/material'
import { useMemo } from 'react'
import { useSelector } from 'react-redux'

interface FilterBarProps {
  mode: UserRole
}

export const FilterBar = ({ mode }: FilterBarProps) => {
  const { view, filterOptions, viewSettingsTemp, showArchived, showUnarchived, showSubtasks, previewMode, tasks } =
    useSelector(selectTaskBoard)

  const { updateViewModeSetting, handleFilterOptionsChange, iuFilterButtons, clientFilterButtons, previewFilterButtons } =
    useFilterBar()

  const viewMode = viewSettingsTemp ? viewSettingsTemp.viewMode : view
  const displayOptions = {
    showArchived: viewSettingsTemp ? viewSettingsTemp.showArchived : showArchived,
    showUnarchived: viewSettingsTemp ? viewSettingsTemp.showUnarchived : showUnarchived,
    showSubtasks: viewSettingsTemp ? viewSettingsTemp.showSubtasks : showSubtasks,
  }

  const viewModeFilterOptions = viewSettingsTemp ? (viewSettingsTemp.filterOptions as IFilterOptions) : filterOptions //ViewSettingsTemp used to apply temp values of viewSettings in filterOptions and viewMode because clientSideUpdate applies outdated cached values to original view and filterOptions if navigated

  const ButtonIndex = previewMode
    ? (previewFilterTypeToButtonIndexMap[viewModeFilterOptions.type] ?? 0)
    : mode === UserRole.IU
      ? (filterTypeToButtonIndexMap[viewModeFilterOptions.type] ?? 0)
      : (clientFilterTypeToButtonIndexMap[viewModeFilterOptions.type] ?? 0)

  const handleDisplayOptionsChange = (displayOptions: DisplayOptions) => {
    store.dispatch(setIsTasksLoading(true))
    const newViewSettings = {
      viewMode,
      filterOptions,
      ...displayOptions,
    }
    store.dispatch(setViewSettings(newViewSettings))
    updateViewModeSetting(newViewSettings)
    store.dispatch(setViewSettingsTemp(newViewSettings))
  }

  // handles click on filter by type buttons

  const filterButtons = useMemo(() => {
    if (previewMode) return previewFilterButtons

    if (mode === UserRole.IU) return iuFilterButtons

    if (mode === UserRole.Client) {
      // If there are IU tasks when the mode is Client, it's safe to assume that this is a visible task
      const hasVisibleTasks = tasks.find((task) => task.internalUserId)
      return hasVisibleTasks ? clientFilterButtons : []
    }

    return []
  }, [tasks, mode, previewMode, clientFilterButtons, iuFilterButtons, previewFilterButtons])

  return (
    <Box
      sx={
        previewMode
          ? { borderBottom: (theme) => `1px solid ${theme.color.borders.borderDisabled}` }
          : {
              borderBottom: (theme) => `1px solid ${theme.color.borders.borderDisabled}`,
            }
      }
    >
      <Box
        sx={{
          display: {
            xs: 'none',
            sm: 'none',
            sd: 'block',
            height: '48px',
          },
        }}
      >
        <Stack direction={'row'} justifyContent={'space-between'} sx={{ maxHeight: '48px' }}>
          <Stack direction={'row'} columnGap={3}>
            <FilterButtonGroup filterButtons={filterButtons} activeButtonIndex={ButtonIndex} />
          </Stack>
          <Stack
            direction="row"
            alignItems="center"
            sx={{
              padding: '0px 20px',
              height: '48px',
            }}
            columnGap={3}
          >
            <SearchBar
              value={viewModeFilterOptions.keyword}
              getSearchKeyword={(keyword) => {
                handleFilterOptionsChange(FilterOptions.KEYWORD, keyword)
              }}
              onClear={() => {
                handleFilterOptionsChange(FilterOptions.KEYWORD, '')
              }}
            />
            <DisplaySelector
              selectedMode={viewMode}
              handleModeChange={(mode) => {
                store.dispatch(
                  setViewSettings({
                    viewMode: mode,
                    filterOptions,
                    showArchived,
                    showUnarchived,
                    showSubtasks,
                  }),
                )
                updateViewModeSetting({
                  viewMode: mode,
                  filterOptions,
                  showArchived,
                  showUnarchived,
                  showSubtasks,
                })
                store.dispatch(
                  setViewSettingsTemp({
                    viewMode: mode,
                    filterOptions,
                    showArchived,
                    showUnarchived,
                    showSubtasks,
                  }),
                )
              }}
              displayOptions={displayOptions}
              handleDisplayOptionsChange={handleDisplayOptionsChange}
            />
            {previewMode && (
              <IconBtn
                handleClick={() => {
                  store.dispatch(setShowModal())
                }}
                padding="8px"
                icon={<AddLargeIcon />}
              />
            )}
          </Stack>
        </Stack>
      </Box>
      <Box sx={{ display: { sm: 'block', sd: 'none' }, height: '48px' }}>
        <Stack direction={'row'} justifyContent={'space-between'} sx={{ maxHeight: '32px' }}>
          <FilterButtonGroup filterButtons={filterButtons} activeButtonIndex={ButtonIndex} mobileView={true} />
          <Stack
            direction="row"
            justifyContent="end"
            alignItems="center"
            sx={{
              '@media (max-width: 368px)': {
                flexWrap: 'wrap',
                height: '48px',
              },
              rowGap: '8px',
              columnGap: '8px',
              height: '48px',
              padding: '0px 20px',
            }}
          >
            <Stack direction={'row'} columnGap={2}>
              <SearchBar
                value={viewModeFilterOptions.keyword}
                getSearchKeyword={(keyword) => {
                  handleFilterOptionsChange(FilterOptions.KEYWORD, keyword)
                }}
                onClear={() => {
                  handleFilterOptionsChange(FilterOptions.KEYWORD, '')
                }}
              />
              <DisplaySelector
                mobileView
                selectedMode={viewMode}
                handleModeChange={(mode) => {
                  store.dispatch(
                    setViewSettings({
                      viewMode: mode,
                      filterOptions: filterOptions,
                      showArchived: showArchived,
                      showUnarchived: showUnarchived,
                      showSubtasks: showSubtasks,
                    }),
                  )
                  updateViewModeSetting({
                    viewMode: mode,
                    filterOptions: filterOptions,
                    showArchived: showArchived,
                    showUnarchived: showUnarchived,
                    showSubtasks: showSubtasks,
                  })
                  store.dispatch(
                    setViewSettingsTemp({
                      viewMode: mode,
                      filterOptions: viewModeFilterOptions,
                      showArchived: showArchived,
                      showUnarchived: showUnarchived,
                      showSubtasks: showSubtasks,
                    }),
                  )
                }}
                displayOptions={displayOptions}
                handleDisplayOptionsChange={handleDisplayOptionsChange}
              />
            </Stack>
          </Stack>
        </Stack>
      </Box>
    </Box>
  )
}
