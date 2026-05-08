'use client'

import { UserRole } from '@/app/api/core/types/user'
import { AppMargin, SizeofAppMargin } from '@/hoc/AppMargin'
import { TasksListIcon } from '@/icons'

import { SxCenter } from '@/utils/mui'
import { Box, Button, Stack, Typography } from '@mui/material'
import Link from 'next/link'

import { z } from 'zod'

export const DeletedRedirectPage = ({
  userType,
  token,
  fromNotificationCenter,
  entity = 'Task',
}: {
  userType?: UserRole
  token: string
  fromNotificationCenter?: boolean
  entity?: 'Task' | 'Template'
}) => {
  const tokenstring = z.string().parse(token)
  return (
    <>
      <AppMargin size={SizeofAppMargin.LARGE} py="20px">
        <Box
          sx={{
            display: 'flex',
            height: '80vh',
            ...SxCenter,
          }}
        >
          <Stack rowGap={'20px'} direction={'column'} sx={{ width: '453px' }}>
            <Stack rowGap={'12px'} direction={'column'}>
              <Box
                sx={{
                  padding: '6px',
                  background: '#EFF1F4',
                  width: '40px',
                  borderRadius: '6px',
                  gap: '20px',
                  height: '40px',
                }}
              >
                <TasksListIcon />
              </Box>

              <Typography variant="2xl" lineHeight={'32px'}>
                No {entity.toLowerCase()} to show
              </Typography>
              <Typography variant="bodyLg" sx={{ color: '#6B6F76' }}>
                This {entity.toLowerCase()} has been deleted. You can view your other {entity}s on the {entity} homepage.
              </Typography>
            </Stack>
            {/* disable board navigation on notification-center-view */}
            {!fromNotificationCenter && (
              <Link
                href={
                  entity == 'Template'
                    ? `/configure-tasks-app?token=${tokenstring}`
                    : `/${userType === UserRole.Client ? 'client' : ''}?token=${tokenstring}`
                }
              >
                <Button
                  variant="contained"
                  startIcon={null}
                  sx={{
                    textTransform: 'none',
                    bgcolor: '#212B36',
                    boxShadow: 'none',
                    '&:hover': { backgroundColor: '#212B36', boxShadow: 'none' },
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                  disableRipple
                  disableTouchRipple
                >
                  <Typography variant="sm">View {entity}s</Typography>
                </Button>
              </Link>
            )}
          </Stack>
        </Box>
      </AppMargin>
    </>
  )
}
