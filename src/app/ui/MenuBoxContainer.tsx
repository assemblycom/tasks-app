'use client'

import { ListBtn } from '@/components/buttons/ListBtn'
import { MenuBox } from '@/components/inputs/MenuBox'
import { CustomLink } from '@/hoc/CustomLink'
import { TemplateIcon } from '@/icons'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { useSelector } from 'react-redux'

export const MenuBoxContainer = () => {
  const { token } = useSelector(selectTaskBoard)
  return (
    <MenuBox
      menuContent={
        <CustomLink href={{ pathname: '/configure-tasks-app', query: { token } }}>
          <ListBtn
            content="Manage templates"
            handleClick={() => {}}
            icon={<TemplateIcon />}
            contentColor={(theme) => theme.color.text.text}
            width="175px"
          />
        </CustomLink>
      }
      noHover={true}
      displayButtonBackground={false}
      width={'32px'}
      height={'32px'}
    />
  )
}
