'use client'

import { StyledKeyboardIcon, StyledTypography } from '@/app/detail/ui/styledComponent'
import { SecondaryBtn } from '@/components/buttons/SecondaryBtn'
import { CustomLink } from '@/hoc/CustomLink'
import { useBreadcrumbs } from '@/hooks/app-bridge/useBreadcrumbs'
import { useWindowWidth } from '@/hooks/useWindowWidth'
import { selectAuthDetails } from '@/redux/features/authDetailsSlice'
import { selectTaskBoard } from '@/redux/features/taskBoardSlice'
import { UserType } from '@/types/interfaces'
import { Stack, Typography } from '@mui/material'
import { useRouter } from 'next/navigation'
import { Fragment, useMemo } from 'react'
import { useSelector } from 'react-redux'

type ValidTasksBoardLink = '/' | '/client'

export const HeaderBreadcrumbs = ({
  token,
  items,
  userType,
}: {
  token: string | undefined
  items: { label: string; mobileLabel?: string; href?: string }[]
  userType: UserType
}) => {
  const { previewMode } = useSelector(selectTaskBoard)
  const { workspace } = useSelector(selectAuthDetails)
  const portalUrl = workspace?.portalUrl
  const router = useRouter()
  const windowWidth = useWindowWidth()
  // Below 600px the platform-rendered header overflows with long titles,
  // so fall back to the shorter task label that we send via app-bridge.
  const isMobile = windowWidth < 600 && windowWidth !== 0

  const displayItems = useMemo(
    () =>
      items.map(({ label, mobileLabel, href }) => ({
        label: isMobile && mobileLabel ? mobileLabel : label,
        href,
      })),
    [items, isMobile],
  )

  const getTasksLink = (userType: UserType): ValidTasksBoardLink => {
    if (previewMode) return '/client'

    const tasksLinks: Record<UserType, ValidTasksBoardLink> = {
      [UserType.INTERNAL_USER]: '/',
      [UserType.CLIENT_USER]: '/client',
    }
    return tasksLinks[userType]
  }
  useBreadcrumbs(
    displayItems.map(({ label, href }, index) => ({
      label,
      onClick: index === displayItems.length - 1 ? undefined : href ? () => router.push(href) : undefined,
    })),
    { portalUrl },
  )

  if (!previewMode) {
    return null
  }
  return (
    <Stack direction="row" alignItems="center" columnGap={3}>
      <CustomLink href={{ pathname: getTasksLink(userType), query: { token } }}>
        <SecondaryBtn
          buttonContent={
            <StyledTypography variant="sm" lineHeight={'21px'} sx={{ fontSize: '13px' }}>
              Tasks
            </StyledTypography>
          }
          variant="breadcrumb"
        />
      </CustomLink>
      {displayItems.map((item, index) => {
        const isLast = index === displayItems.length - 1

        return (
          <Fragment key={item.label}>
            {isLast ? (
              <>
                <StyledKeyboardIcon />
                <Typography variant="sm" sx={{ fontSize: '13px' }}>
                  {item.label}
                </Typography>
              </>
            ) : (
              <CustomLink href={item.href ?? ''}>
                <StyledKeyboardIcon />
                <SecondaryBtn
                  buttonContent={
                    <StyledTypography variant="sm" lineHeight={'21px'} sx={{ fontSize: '13px' }}>
                      {item.label}
                    </StyledTypography>
                  }
                  variant="breadcrumb"
                />
              </CustomLink>
            )}
          </Fragment>
        )
      })}
    </Stack>
  )
}
