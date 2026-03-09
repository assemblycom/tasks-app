import { FilterChip } from '@/components/buttons/FilterChip'
import { FilterSelector } from '@/components/inputs/FilterSelector'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { FilterType } from '@/types/common'
import { UserRole } from '@api/core/types/user'
import { Box, Stack } from '@mui/material'
import { useSelector } from 'react-redux'

interface SecondaryFilterBarProps {
  mode: UserRole
}

export const SecondaryFilterBar = ({ mode }: SecondaryFilterBarProps) => {
  const { filterOptions } = useSelector(selectTaskBoard)

  return (
    <Stack direction="row" gap={'8px'} sx={{ padding: '12px 20px' }}>
      <FilterChip type={FilterType.Assignee} assignee={filterOptions.assignee} />
      <FilterChip type={FilterType.Association} assignee={filterOptions.association} />
      <FilterChip type={FilterType.Creator} assignee={filterOptions.creator} />

      <Box>
        <FilterSelector />
      </Box>
    </Stack>
  )
}
