'use client'

import { PrimaryBtn } from '@/components/buttons/PrimaryBtn'
import { PlusIcon, TemplateIconLg } from '@/icons'
import { Box, Stack, Typography } from '@mui/material'
import store from '@/redux/store'
import { setShowTemplateModal } from '@/redux/features/templateSlice'
import { TargetMethod } from '@/types/interfaces'

export const NoTemplateLayout = () => {
  return (
    <>
      <Stack
        direction="column"
        rowGap={3}
        sx={{
          position: 'absolute',
          top: '45%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          maxWidth: '444px',
        }}
      >
        <Stack
          direction="row"
          justifyContent="center"
          sx={{
            borderRadius: (theme) => theme.shape.radius100,
            background: '#F1F3F8',
            padding: 2,
            width: '40px',
            height: '40px',
          }}
        >
          <Stack
            direction="row"
            justifyContent="center"
            alignItems="center"
            sx={{
              borderRadius: '6px',
            }}
          >
            <TemplateIconLg />
          </Stack>
        </Stack>

        <Typography variant="2xl">No templates found</Typography>
        <Typography variant="bodyMd" fontSize="15px" sx={{ color: (theme) => theme.color.gray[500] }}>
          Templates will be shown here.
        </Typography>
        <Box width="fit-content">
          <PrimaryBtn
            handleClick={() => {
              store.dispatch(setShowTemplateModal({ targetMethod: TargetMethod.POST }))
            }}
            buttonText="Create template"
            startIcon={<PlusIcon />}
          />
        </Box>
      </Stack>
    </>
  )
}
