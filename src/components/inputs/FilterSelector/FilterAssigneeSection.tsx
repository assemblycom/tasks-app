import { StyledUserCompanySelector } from '@/app/detail/ui/styledComponent'
import { useFilterBar } from '@/hooks/useFilterBar'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { FilterType } from '@/types/common'
import { FilterOptions, FilterOptionsKeywords, InputValue } from '@/types/interfaces'
import { parseAssigneeToSelectorOption } from '@/utils/addTypeToAssignee'
import { getWorkspaceLabels } from '@/utils/getWorkspaceLabels'
import { getSelectedUserIds } from '@/utils/selector'
import { Box } from '@mui/material'
import { Dispatch, SetStateAction } from 'react'
import { useSelector } from 'react-redux'

interface FilterAssigneeSectionProps {
  filterMode: FilterType
  setAnchorEl: Dispatch<SetStateAction<HTMLElement | null>>
}

export const filterOptionsMap = {
  [FilterType.Assignee]: FilterOptions.ASSIGNEE,
  [FilterType.Creator]: FilterOptions.CREATOR,
  [FilterType.Association]: FilterOptions.ASSOCIATION,
}

export const FilterAssigneeSection = ({ filterMode, setAnchorEl }: FilterAssigneeSectionProps) => {
  const {
    assignee: assignees,
    filterOptions: { type },
  } = useSelector(selectTaskBoard)
  const { handleFilterOptionsChange } = useFilterBar()
  const { workspace } = useSelector(selectAuthDetails)

  const selectorAssignees = parseAssigneeToSelectorOption(assignees)

  const hideClientsAndCompanies =
    filterMode === FilterType.Creator || (type === FilterOptionsKeywords.TEAM && filterMode === FilterType.Assignee)
  const hideIus =
    filterMode === FilterType.Association || (type === FilterOptionsKeywords.CLIENTS && filterMode === FilterType.Assignee)

  const handleChange = (inputValue: InputValue[]) => {
    const newUserIds = getSelectedUserIds(inputValue)
    handleFilterOptionsChange(filterOptionsMap[filterMode], newUserIds)
    setAnchorEl(null)
  }

  return (
    <Box>
      <StyledUserCompanySelector
        menuShouldScrollIntoView={false}
        menuIsOpen={true}
        placeholder={'Search'}
        name={'Search'}
        internalUsers={hideIus ? [] : selectorAssignees.internalUsers}
        clientUsers={hideClientsAndCompanies ? [] : selectorAssignees.clients}
        companies={hideClientsAndCompanies ? [] : selectorAssignees.companies}
        onChange={(inputValue: InputValue[]) => {
          handleChange(inputValue)
        }}
        grouped={true}
        limitSelectedOptions={1}
        customLabels={getWorkspaceLabels(workspace, true)}
      />
    </Box>
  )
}
