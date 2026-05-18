import { StyledUserCompanySelector } from '@/app/detail/ui/styledComponent'
import { CopilotTooltip, CopilotTooltipProps } from '@/components/atoms/CopilotTooltip'
import useClickOutside from '@/hooks/useClickOutside'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { IAssigneeCombined, InputValue, ISelectorOption } from '@/types/interfaces'
import { parseAssigneeToSelectorOption } from '@/utils/addTypeToAssignee'
import { parseAssigneeToSelectorOptions } from '@/utils/assignee'
import { getWorkspaceLabels } from '@/utils/getWorkspaceLabels'
import { selectorOptionsToInputValue } from '@/utils/selector'
import { userCompanySelectorStyles } from './UserCompanySelectorStyles'
import { Box, ClickAwayListener, Popper, Stack } from '@mui/material'
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'

export const CopilotSelector = ({
  onChange,
  name,
  initialAssignee,
  hideClientsList,
  hideIusList,
}: {
  onChange: (inputValue: InputValue[]) => void
  name: string
  initialAssignee?: ISelectorOption[]
  hideClientsList?: boolean
  hideIusList?: boolean
}) => {
  const { assignee } = useSelector(selectTaskBoard)
  const { workspace } = useSelector(selectAuthDetails)

  // Currently selected assignee. This is not guarenteed to be the same as the final assignee
  // and is just the temporary state while the selector is still open
  const [currentlySelected, setCurrentlySelected] = useState<InputValue[]>(
    initialAssignee ? selectorOptionsToInputValue(initialAssignee) : [],
  )

  const selectorAssignee = parseAssigneeToSelectorOption(assignee)

  return (
    <StyledUserCompanySelector
      className="user-company-selector"
      openMenuOnFocus
      menuIsOpen={true}
      autoFocus
      placeholder={name}
      initialValue={initialAssignee}
      clientUsers={hideClientsList ? [] : selectorAssignee.clients}
      name={name}
      internalUsers={hideIusList ? [] : selectorAssignee.internalUsers}
      companies={hideClientsList ? [] : selectorAssignee.companies}
      onChange={(inputValue: InputValue[]) => {
        setCurrentlySelected(inputValue)
        onChange(inputValue)
      }}
      grouped={true}
      limitSelectedOptions={1}
      customLabels={getWorkspaceLabels(workspace, true)}
      styles={userCompanySelectorStyles}
    />
  )
}

interface CopilotPopSelectorProps {
  buttonContent: ReactNode
  disabled?: boolean
  onClick?: () => void
  name: string
  onChange: (inputValue: InputValue[]) => void
  initialValue?: IAssigneeCombined
  hideClientsList?: boolean
  hideIusList?: boolean
  tooltipProps?: Omit<CopilotTooltipProps, 'children'>
  variant?: 'icon' | 'normal'
  captureClick?: boolean
}

export const CopilotPopSelector = ({
  buttonContent,
  disabled = false,
  name,
  onChange,
  initialValue,
  hideClientsList,
  hideIusList,
  tooltipProps,
  variant = 'normal',
  captureClick = true,
}: CopilotPopSelectorProps) => {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const popperRef = useRef<HTMLDivElement>(null)

  const shouldCallOnChangeWithEmpty = useRef(false)
  const initialAssignee = initialValue && parseAssigneeToSelectorOptions(initialValue)

  const [selectedAssignee, setSelectedAssignee] = useState<InputValue[] | undefined>(
    initialAssignee && selectorOptionsToInputValue(initialAssignee),
  )

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (!disabled) {
        setSelectedAssignee(initialAssignee && selectorOptionsToInputValue(initialAssignee))
        setOpen((prev) => !prev)
        shouldCallOnChangeWithEmpty.current = false
      }
    },
    [disabled, initialAssignee],
  )

  const handleClose = useCallback(() => {
    if (shouldCallOnChangeWithEmpty.current && selectedAssignee && !selectedAssignee.length) {
      onChange(selectedAssignee)
      shouldCallOnChangeWithEmpty.current = false
    }
    setOpen(false)
  }, [onChange, selectedAssignee])

  const id = open ? 'selector-popper' : ''

  useEffect(() => {
    function closePopper(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        e.stopPropagation()
        handleClose()
      }
    }
    if (open) {
      document.addEventListener('keydown', closePopper, true)
    }
    return () => {
      document.removeEventListener('keydown', closePopper, true)
    }
  }, [open])

  // Close when clicked outside both the box and the popper
  useClickOutside([anchorRef, popperRef], () => {
    setOpen(false)
    handleClose()
  })

  return (
    <ClickAwayListener
      onClickAway={() => {
        if (open) {
          shouldCallOnChangeWithEmpty.current = true
        }
      }}
      touchEvent="onTouchEnd"
    >
      <Stack direction="column">
        <Box {...(captureClick ? { onClickCapture: handleClick } : { onClick: handleClick })} ref={anchorRef}>
          <CopilotTooltip
            content={tooltipProps?.content ?? 'Change assignee'}
            disabled={tooltipProps?.disabled || variant == 'normal'}
            position={tooltipProps?.position}
          >
            <>{buttonContent}</>
          </CopilotTooltip>
        </Box>
        <Popper
          id={id}
          open={open}
          anchorEl={anchorRef.current}
          sx={{
            zIndex: '1600',
            width: 'fit-content',
          }}
          placement="bottom-start"
          onClick={(e) => {
            e.stopPropagation()
          }}
        >
          <div ref={popperRef}>
            <CopilotSelector
              hideClientsList={hideClientsList}
              hideIusList={hideIusList}
              initialAssignee={initialAssignee}
              name={name}
              onChange={(inputValue) => {
                setSelectedAssignee(inputValue)
                if (inputValue.length) {
                  onChange(inputValue)
                  setOpen(false)
                } else {
                  shouldCallOnChangeWithEmpty.current = true
                }
              }}
            />
          </div>
        </Popper>
      </Stack>
    </ClickAwayListener>
  )
}
