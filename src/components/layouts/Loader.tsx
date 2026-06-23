import { Box, CircularProgress } from '@mui/material'

const LoaderComponent = () => {
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'transparent',
      }}
    >
      <CircularProgress color="inherit" size={40} />
    </Box>
  )
}

export default LoaderComponent
