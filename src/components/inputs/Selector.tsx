import { Box, Button, Popper, Stack, SxProps, Theme, Typography } from '@mui/material'
import { StyledAutocomplete } from '@/components/inputs/Autocomplete'
import { statusIcons } from '@/utils/iconMatcher'
import { useFocusableInput } from '@/hooks/useFocusableInput'
import { HTMLAttributes, ReactNode, useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { StyledTextField } from './TextField'
import { WorkflowStateResponse } from '@/types/dto/workflowStates.dto'
import { IAssigneeCombined, Sizes, IExtraOption, ITemplate, UserTypesName } from '@/types/interfaces'
import { TruncateMaxNumber } from '@/types/constants'
import { truncateText } from '@/utils/truncateText'
import { CopilotAvatar } from '@/components/atoms/CopilotAvatar'
import { getAssigneeName } from '@/utils/assignee'
import { StyledHelperText } from '@/components/error/FormHelperText'
import React from 'react'
import { ModifierArguments, ModifierPhases, Placement } from '@popperjs/core'
import { Property } from 'csstype'
import ListboxComponent from '@/components/inputs/ListboxComponent'
import { SelectorButton } from '@/components/buttons/SelectorButton'

export enum SelectorType {
  ASSIGNEE_SELECTOR = 'assigneeSelector',
  STATUS_SELECTOR = 'statusSelector',
  TEMPLATE_SELECTOR = 'templateSelected',
}
type SelectorOptionsType = {
  [K in keyof typeof SelectorType as (typeof SelectorType)[K]]: K extends 'ASSIGNEE_SELECTOR'
    ? IAssigneeCombined
    : K extends 'STATUS_SELECTOR'
      ? WorkflowStateResponse
      : K extends 'TEMPLATE_SELECTOR'
        ? ITemplate
        : never
}

interface Prop<T extends keyof SelectorOptionsType> {
  getSelectedValue: (value: unknown) => void
  startIcon?: ReactNode
  value: unknown
  selectorType: T
  options: SelectorOptionsType[T][] | IExtraOption[]
  buttonContent?: ReactNode
  inputStatusValue: string
  setInputStatusValue: React.Dispatch<React.SetStateAction<string>>
  disabled?: boolean
  placeholder?: string
  extraOption?: IExtraOption
  extraOptionRenderer?: (
    setAnchorEl: React.Dispatch<React.SetStateAction<HTMLElement | null>>,
    anchorEl: null | HTMLElement,
    props?: HTMLAttributes<HTMLLIElement>,
  ) => ReactNode
  variant?: 'normal' | 'outlined' | 'icon'
  padding?: string
  buttonWidth?: string
  buttonHeight?: string
  responsiveNoHide?: boolean
  handleInputChange?: (_: string) => void
  filterOption?: any
  onClick?: () => void
  error?: boolean
  endIcon?: ReactNode
  endOption?: ReactNode
  endOptionHref?: string
  listAutoHeightMax?: string
  useClickHandler?: boolean
  cursor?: Property.Cursor
  currentOption?: SelectorOptionsType[T] //option which shall be at the top of the selector without any grouping
  errorPlaceholder?: string
  customDropdownWidth?: number
}

export default function Selector<T extends keyof SelectorOptionsType>({
  getSelectedValue,
  startIcon,
  value,
  selectorType,
  options,
  buttonContent,
  disabled,
  placeholder = 'Change status...',
  inputStatusValue,
  setInputStatusValue,
  extraOption,
  extraOptionRenderer,
  variant = 'outlined',
  padding,
  buttonWidth,
  buttonHeight,
  responsiveNoHide,
  handleInputChange,
  filterOption,
  onClick,
  error,
  endIcon,
  endOption,
  endOptionHref,
  listAutoHeightMax,
  useClickHandler,
  cursor,
  currentOption,
  errorPlaceholder = 'Required',
  customDropdownWidth,
}: Prop<T>) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!disabled) {
      setAnchorEl(anchorEl ? null : event.currentTarget)
    }
    onClick?.()
  }
  const open = Boolean(anchorEl)
  const id = open ? 'autocomplete-popper' : ''

  const setSelectorRef = useFocusableInput(open)

  const processedOptions = useMemo(() => {
    if (!currentOption) return options
    if (!options.some((option) => option.id === currentOption.id)) return options
    const filteredOptions = options.filter((option) => option.id !== currentOption.id)
    return [currentOption, ...filteredOptions]
  }, [currentOption, options]) // bring currentOption to the top of the selector options.

  const standaloneOptionIds = useMemo(() => {
    return currentOption ? new Set([currentOption.id]) : new Set()
  }, [currentOption]) //differentiate currentOption from the rest of the option to remove any kind of grouping.

  function detectSelectorType(option: unknown) {
    if (selectorType === SelectorType.ASSIGNEE_SELECTOR) {
      return (
        (option as IAssigneeCombined)?.name ||
        `${(option as IAssigneeCombined)?.givenName ?? ''} ${(option as IAssigneeCombined)?.familyName ?? ''}`.trim()
      )
    }

    if (selectorType === SelectorType.STATUS_SELECTOR) {
      return (option as WorkflowStateResponse).name as string
    }
    if (selectorType === SelectorType.TEMPLATE_SELECTOR) {
      return (option as ITemplate).title as string
    } else {
      return ''
    }
  }

  const [placement, setPlacement] = useState<Placement>('bottom')
  const timeoutRef = useRef<NodeJS.Timeout>(undefined)

  const handlePlacementChange = useCallback((data: ModifierArguments<any>) => {
    if (data.state?.placement && data.state.placement !== placement) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        setPlacement(data.state.placement)
      }, 100)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current) //cleanup function for popper placement debouncing
      }
    }
  }, [])

  const popperModifiers = useMemo(
    () => [
      {
        name: 'onUpdatePlacement',
        enabled: true,
        phase: 'afterWrite' as ModifierPhases,
        fn: handlePlacementChange,
      },
      {
        name: 'preventAutoFocus',
        enabled: true,
      },
    ],
    [handlePlacementChange],
  )

  useEffect(() => {
    function closePopper(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setAnchorEl(null)
      }
    }

    window.addEventListener('keydown', closePopper)

    return () => {
      window.removeEventListener('keydown', closePopper)
    }
  }, [])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      setAnchorEl(null)
    }
  }

  return (
    <Stack direction="column">
      <Box onMouseDown={handleClick} aria-describedby={id}>
        {variant == 'normal' ? (
          <Stack
            direction="row"
            alignItems="center"
            columnGap="7px"
            justifyContent="flex-start"
            sx={{
              width: { sm: responsiveNoHide ? buttonWidth || '100px' : '36px', md: buttonWidth || '100px' },
              justifyContent: { xs: 'flex-start', sm: 'flex-start' },
              cursor: disabled ? 'auto' : (cursor ?? 'pointer'),
              borderRadius: '4px',
              padding: padding ? padding : '8px 8px',
              ':hover': {
                backgroundColor: disabled ? 'none' : (theme) => theme.color.gray[100],
                cursor: disabled ? 'auto' : 'pointer',
              },
            }}
          >
            <Box>{startIcon}</Box>
            {buttonContent && (
              <Typography
                variant="bodySm"
                sx={{
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  maxWidth: '150px',
                  display: { xs: responsiveNoHide ? 'block' : 'none', sm: 'block' },
                  userSelect: 'none',
                }}
              >
                {buttonContent}
              </Typography>
            )}
          </Stack>
        ) : variant == 'outlined' ? (
          <>
            <SelectorButton
              startIcon={startIcon}
              buttonContent={buttonContent}
              disabled={disabled}
              padding={padding}
              height={buttonHeight}
              error={error}
              endIcon={endIcon}
            />
            {error && errorPlaceholder && <StyledHelperText> Required</StyledHelperText>}
          </>
        ) : (
          <> {buttonContent}</>
        )}
      </Box>
      <Popper
        id={id}
        open={open}
        anchorEl={anchorEl}
        sx={{
          width: customDropdownWidth ? `${customDropdownWidth}px` : 'fit-content',
          zIndex: '9999',
        }}
        placement="bottom-start"
      >
        <StyledAutocomplete
          placement={placement}
          id={selectorType}
          onBlur={() => {
            setAnchorEl(null)
          }}
          blurOnSelect={true}
          openOnFocus
          onKeyDown={handleKeyDown}
          autoSelect={false}
          ListboxProps={
            {
              endOption: endOption,
              endOptionHref: endOptionHref,
              sx: {
                maxHeight: {
                  xs: '175px',
                  sm: '291px',
                },
                '& .MuiAutocomplete-option[aria-selected="true"].Mui-focused': {
                  backgroundColor: (theme) => theme.color.background.bgHover,
                },
                '& .MuiAutocomplete-option[aria-selected="true"]': {
                  backgroundColor: (theme) => theme.color.base.white,
                },
                '& .MuiAutocomplete-option.Mui-focused': {
                  backgroundColor: (theme) => theme.color.background.bgHover,
                },
                padding: '0px',
              },
            } as ExtendedListboxProps
          }
          options={extraOption ? [extraOption, ...processedOptions] : processedOptions}
          value={value}
          onChange={(_, newValue: unknown) => {
            if (newValue && !useClickHandler) {
              getSelectedValue(newValue)
              setAnchorEl(null)
              setInputStatusValue('')
            }
          }}
          ListboxComponent={ListWithEndOption}
          getOptionLabel={(option: unknown) => detectSelectorType(option)}
          groupBy={(option: unknown) => {
            if (standaloneOptionIds.has((option as SelectorOptionsType[typeof selectorType]).id)) {
              return UserTypesName['standalone']
            }
            return selectorType === SelectorType.ASSIGNEE_SELECTOR ? UserTypesName[(option as IAssigneeCombined).type] : ''
          }}
          slotProps={{
            paper: {
              sx: {
                '& .MuiAutocomplete-noOptions': {
                  padding: '0px',
                },
                boxShadow: 'none',
                border: (theme) => `1px solid ${theme.color.borders.border2}`,
                borderTop: (theme) => (placement === 'top' ? `1px solid ${theme.color.borders.border2}` : 'none'),
                borderBottom: (theme) => (placement === 'top' ? 'none' : `1px solid ${theme.color.borders.border2}`),
                borderRadius: placement == 'top' ? '4px 4px 0px 0px' : '0px 0px 4px 4px',
              },
            },
            popper: {
              modifiers: popperModifiers,
            },
          }}
          filterOptions={filterOption}
          renderGroup={(params) => {
            if (!params.children) return <></>

            const hasNoAssignee =
              Array.isArray(params?.children) &&
              params?.children?.some((child) => child?.props?.props?.key === 'No assignee')
            if (params.group === UserTypesName['standalone']) {
              return params.children
            }
            return (
              <Box key={params.key}>
                {hasNoAssignee ? (
                  <Box>{params.children}</Box>
                ) : (
                  <Box>
                    <Stack direction="row" alignItems="center" columnGap={2}>
                      <Typography
                        variant={'sm'}
                        sx={{
                          color: (theme) => theme.color.gray[500],
                          marginLeft: '18px',
                          padding: '2px 0px',
                          lineHeight: '24px',
                        }}
                      >
                        {params.group}
                      </Typography>
                    </Stack>
                    {params.children}
                  </Box>
                )}
              </Box>
            )
          }}
          inputValue={inputStatusValue}
          renderInput={(params) => {
            return (
              <StyledTextField
                {...params}
                variant="outlined"
                inputRef={setSelectorRef}
                placeholder={placeholder}
                borderColor="#EDEDF0"
                padding="4px 12px 8px 12px"
                basePadding="8px 12px 8px 12px"
                sx={{
                  width: customDropdownWidth ? `${customDropdownWidth}px` : '200px',
                  visibility: { xs: 'none', sm: 'visible' },
                  borderRadius: '4px',
                }}
                onChange={(e) => {
                  handleInputChange?.(e.target.value)
                  setInputStatusValue(e.target.value)
                }}
                onBlur={() => {
                  setInputStatusValue('')
                  handleInputChange?.('')
                }}
              />
            )
          }}
          renderOption={(props, option: unknown) => {
            const onClickHandler = () => {
              getSelectedValue(option)
              setAnchorEl(null)
              setInputStatusValue('')
            }
            const { key, ...otherProps } = props
            if ((option as IExtraOption).id === 'not_found') {
              return (
                <Box
                  key={key}
                  sx={{
                    color: 'gray',
                    textAlign: 'left',
                    padding: '6px 14px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '205px',
                  }}
                >
                  <Typography variant="sm" sx={{ color: (theme) => theme.color.text.textDisabled }}>
                    {`No matches found for "${inputStatusValue}"`}
                  </Typography>
                </Box>
              )
            }

            if (extraOption && extraOptionRenderer && (option as IExtraOption)?.extraOptionFlag) {
              return <div key={key}>{extraOptionRenderer(setAnchorEl, anchorEl, otherProps)}</div>
            }

            if (selectorType === SelectorType.ASSIGNEE_SELECTOR) {
              return <AssigneeSelectorRenderer key={key} props={otherProps} option={option} />
            }

            if (selectorType === SelectorType.STATUS_SELECTOR) {
              return <StatusSelectorRenderer key={key} props={otherProps} option={option} />
            }

            if (selectorType === SelectorType.TEMPLATE_SELECTOR) {
              return (
                <TemplateSelectorRenderer
                  key={key}
                  props={otherProps}
                  option={option}
                  onClickHandler={useClickHandler ? onClickHandler : undefined}
                  width={customDropdownWidth}
                />
              )
            }

            return <></>
          }}
          noOptionsText={endOption && <ListWithEndOption endOption={endOption} endOptionHref={endOptionHref} />}
        />
      </Popper>
    </Stack>
  )
}

const TemplateSelectorRenderer = ({
  props,
  option,
  onClickHandler,
  width,
}: {
  props: HTMLAttributes<HTMLLIElement>
  option: unknown
  onClickHandler?: () => void
  width?: number
}) => {
  return (
    <Box
      component="li"
      {...props}
      sx={{
        '&.MuiAutocomplete-option[aria-selected="true"]': {
          bgcolor: (theme) => theme.color.gray[100],
        },
        '&.MuiAutocomplete-option[aria-selected="true"].Mui-focused': {
          bgcolor: (theme) => theme.color.gray[100],
        },
        '&.MuiAutocomplete-option': {
          minHeight: { xs: '32px' },
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
        '&.MuiAutocomplete-option.Mui-focused': {
          bgcolor: (theme) => theme.color.background.bgHover,
        },
        '&.MuiAutocomplete-option:hover': {
          bgcolor: (theme) => theme.color.background.bgHover,
        },
      }}
      onClick={onClickHandler && onClickHandler}
    >
      <Stack direction="row" alignItems="center" columnGap={3}>
        <Typography
          variant="sm"
          fontWeight={400}
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: width ? `${width - 30}px` : '160px', //-30px used as a safe boundary so that the text does not overflow.
          }}
        >
          {(option as ITemplate).title as string}
        </Typography>
      </Stack>
    </Box>
  )
}

const StatusSelectorRenderer = ({ props, option }: { props: HTMLAttributes<HTMLLIElement>; option: unknown }) => {
  return (
    <Box
      component="li"
      {...props}
      sx={{
        '&.MuiAutocomplete-option[aria-selected="true"]': {
          bgcolor: (theme) => theme.color.gray[100],
        },
        '&.MuiAutocomplete-option[aria-selected="true"].Mui-focused': {
          bgcolor: (theme) => theme.color.gray[100],
        },
      }}
    >
      <Stack direction="row" alignItems="center" columnGap={3}>
        <Box>{statusIcons[Sizes.MEDIUM][(option as WorkflowStateResponse).type]}</Box>
        <Typography variant="sm" fontWeight={400}>
          {(option as WorkflowStateResponse).name as string}
        </Typography>
      </Stack>
    </Box>
  )
}
const AssigneeSelectorRenderer = ({ props, option }: { props: HTMLAttributes<HTMLLIElement>; option: unknown }) => {
  const assignee = option as IAssigneeCombined

  return (
    <Box
      component="li"
      {...props}
      sx={(theme) => ({
        '&.MuiAutocomplete-option': {
          minHeight: { xs: '32px' },
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
        '&.MuiAutocomplete-option[aria-selected="true"]': {
          bgcolor: theme.color.base.white,
        },
        '&.MuiAutocomplete-option.Mui-focused': {
          bgcolor: theme.color.background.bgHover,
        },
      })}
    >
      <Stack direction="row" alignItems="center" columnGap={3}>
        <CopilotAvatar currentAssignee={assignee} />
        <Typography variant="bodySm" title={getAssigneeName(option as IAssigneeCombined)}>
          {truncateText(getAssigneeName(option as IAssigneeCombined), TruncateMaxNumber.SELECTOR)}
        </Typography>
      </Stack>
    </Box>
  )
}

const ListWithEndOption = React.forwardRef<
  HTMLDivElement,
  JSX.IntrinsicElements['div'] & { endOption?: React.ReactNode; endOptionHref?: string }
>((props, ref) => {
  const { endOption, endOptionHref, ...other } = props

  return (
    <ListboxComponent {...other} ref={ref} role="listbox" endOption={endOption} endOptionHref={endOptionHref}>
      {props.children}
    </ListboxComponent>
  )
})

ListWithEndOption.displayName = 'ListWithEndOption'

type ExtendedListboxProps = React.HTMLAttributes<HTMLUListElement> & {
  sx?: SxProps<Theme>
  endOption?: React.ReactNode
  endOptionHref?: string
}
