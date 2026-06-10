import { BoardViewIcon, DisplayOptionsIcon, ListViewIcon } from '@/icons'
import { Menu, Stack, styled, Typography } from '@mui/material'
import { ViewMode } from '@prisma/client'
import { SecondaryBtn } from '@/components/buttons/SecondaryBtn'
import { useState, type MouseEvent } from 'react'
import { StyledSwitch } from '@/components/inputs/StyledSwitch'
import type { DisplayOptions } from '@/types/dto/viewSettings.dto'
import { setHasArchiveFilterChanged } from '@/redux/features/taskBoardSlice'
import store from '@/redux/store'

interface DisplaySelectorProps {
  handleModeChange: (mode: ViewMode) => void
  selectedMode: ViewMode
  displayOptions: DisplayOptions
  handleDisplayOptionsChange: (displayOptions: DisplayOptions) => void
  mobileView?: boolean
  lockViewMode?: boolean
  lockShowSubtasks?: boolean
}

export const DisplaySelector = ({
  handleModeChange,
  selectedMode,
  displayOptions,
  handleDisplayOptionsChange,
  mobileView,
  lockViewMode,
  lockShowSubtasks,
}: DisplaySelectorProps) => {
  const [anchorEl, setAnchorEl] = useState<null | Element>(null)
  const open = Boolean(anchorEl)

  const handleClick = (event: MouseEvent) => {
    setAnchorEl(event.currentTarget)
  }
  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleArchiveFilterChange = (options: DisplayOptions) => {
    handleDisplayOptionsChange(options)
    store.dispatch(setHasArchiveFilterChanged(true))
  }

  return (
    <>
      <SecondaryBtn
        buttonContent={
          !mobileView ? (
            <Typography variant="bodySm" sx={{ color: (theme) => theme.color.gray[600], fontSize: '12px' }}>
              Display
            </Typography>
          ) : (
            <DisplayOptionsIcon />
          )
        }
        startIcon={!mobileView && <DisplayOptionsIcon />}
        height="31.25px"
        padding="4px 8px 4px 10px"
        handleClick={handleClick}
        width={mobileView ? '32px' : 'auto'}
      />
      <Menu
        id="basic-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        keepMounted
        disablePortal
        slotProps={{
          paper: {
            sx: {
              width: '240px',
              paddingBottom: '4px',
              alignItems: 'flex-start',
              borderRadius: '8px',
              border: (theme) => `1px solid ${theme.color.borders.borderDisabled}`,
              background: (theme) => theme.color.base.white,
              boxShadow: '0px 6px 20px 0px rgba(0, 0, 0, 0.07)',
              padding: '12px 12px 8px 12px',
            },
          },
        }}
        MenuListProps={{ sx: { py: 0 } }}
        sx={{
          mt: '6px',
        }}
      >
        <Stack
          direction="row"
          columnGap={'8px'}
          sx={{
            alignItems: 'flex-start',
            alignSelf: 'stretch',
            paddingBottom: '8px',
            opacity: lockViewMode ? 0.5 : 1,
            pointerEvents: lockViewMode ? 'none' : 'auto',
          }}
        >
          <IconContainer
            direction="column"
            onClick={() => handleModeChange(ViewMode.list)}
            sx={{
              background: (theme) => (selectedMode == ViewMode.list ? theme.color.gray[100] : theme.color.base.white),
            }}
          >
            <ListViewIcon />
            <Typography variant="bodySm" fontSize={'12px'} sx={{ userSelect: 'none' }}>
              List
            </Typography>
          </IconContainer>

          <IconContainer
            direction="column"
            onClick={() => handleModeChange(ViewMode.board)}
            sx={{
              background: (theme) => (selectedMode == ViewMode.board ? theme.color.gray[100] : theme.color.base.white),
            }}
          >
            <BoardViewIcon />
            <Typography variant="bodySm" fontSize={'12px'} sx={{ userSelect: 'none' }}>
              Board
            </Typography>
          </IconContainer>
        </Stack>

        <Stack
          direction="row"
          columnGap={'8px'}
          sx={{
            display: 'flex',
            alignSelf: 'stretch',
            alignItems: 'center',
            padding: '4px 0px',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="bodyMd"> Show subtasks</Typography>
          <StyledSwitch
            checked={displayOptions.showSubtasks}
            disabled={lockShowSubtasks}
            onChange={(e) =>
              handleDisplayOptionsChange({
                ...displayOptions,
                showSubtasks: e.target.checked,
              })
            }
          />
        </Stack>

        <Stack
          direction="row"
          columnGap={'8px'}
          sx={{
            display: 'flex',
            alignSelf: 'stretch',
            alignItems: 'center',
            padding: '4px 0px',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="bodyMd"> Show unarchived tasks</Typography>
          <StyledSwitch
            checked={displayOptions.showUnarchived}
            onChange={(e) =>
              handleArchiveFilterChange({
                ...displayOptions,
                showUnarchived: e.target.checked,
              })
            }
          />
        </Stack>

        <Stack
          direction="row"
          columnGap={'8px'}
          sx={{
            display: 'flex',
            alignSelf: 'stretch',
            alignItems: 'center',
            padding: '4px 0px',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="bodyMd"> Show archived tasks</Typography>
          <StyledSwitch
            checked={displayOptions.showArchived}
            onChange={(e) =>
              handleArchiveFilterChange({
                ...displayOptions,
                showArchived: e.target.checked,
              })
            }
          />
        </Stack>
      </Menu>
    </>
  )
}

const IconContainer = styled(Stack)(({ theme }) => ({
  display: 'flex',
  padding: '6px 4px 2px 4px',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '1px',
  width: '100%',
  height: 'auto',
  cursor: 'pointer',
  border: `1px solid ${theme.color.gray[150]}`,
  borderRadius: '4px',
  '&:hover': {
    background: theme.color.gray[100],
  },
}))
