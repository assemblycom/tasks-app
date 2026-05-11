// export const fetchCache = 'force-no-store'
// export const revalidate = 0

import { AssigneesFetcher } from '@/app/_fetchers/AssigneesFetcher'
import { WorkspaceFetcher } from '@/app/_fetchers/WorkspaceFetcher'
import { ProgressLoad } from '@/components/TopLoader'
import { InterrupCmdK } from '@/hoc/Interrupt_CmdK'
import { swrConfig } from '@/lib/swr-config'
import { ProviderWrapper } from '@/redux/ProviderWrapper'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Suspense } from 'react'
import { SWRConfig } from 'swr'
import ThemeRegistry from './ThemeRegistry'

import 'copilot-design-system/dist/styles/main.css'
import './globals.css'
import './tapwrite.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Task App',
  description: 'A comprehensive tasks app for the Assembly marketplace',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Suspense fallback={null}>
          <ProgressLoad />
          <InterrupCmdK>
            <ProviderWrapper>
              <ThemeRegistry options={{ key: 'mui' }}>
                <SWRConfig value={swrConfig}>
                  <Suspense fallback={null}>
                    <WorkspaceFetcher />
                  </Suspense>
                  <Suspense fallback={null}>
                    <AssigneesFetcher />
                  </Suspense>
                  {children}
                </SWRConfig>
              </ThemeRegistry>
            </ProviderWrapper>
          </InterrupCmdK>
        </Suspense>
      </body>
    </html>
  )
}
