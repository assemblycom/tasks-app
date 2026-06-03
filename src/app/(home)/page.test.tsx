import type { Token } from '@/types/common'
import type { ReactNode } from 'react'

const mockGetTokenPayload = jest.fn()
const mockRedirectIfTaskCta = jest.fn()
const mockRedirectToClientPortal = jest.fn()

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation(() => ({
    getTokenPayload: mockGetTokenPayload,
  })),
}))

jest.mock('@/utils/redirect', () => ({
  redirectIfTaskCta: (...args: unknown[]) => mockRedirectIfTaskCta(...args),
  redirectToClientPortal: (...args: unknown[]) => mockRedirectToClientPortal(...args),
}))

jest.mock('@/app/(home)/actions', () => ({
  createMultipleAttachments: jest.fn(),
}))

jest.mock('@/app/_cache/AssigneeCacheGetter', () => ({
  AssigneeCacheGetter: () => null,
}))

jest.mock('@/app/_fetchers/AllTasksFetcher', () => ({
  AllTasksFetcher: () => null,
}))

jest.mock('@/app/_fetchers/TemplatesFetcher', () => ({
  TemplatesFetcher: () => null,
}))

jest.mock('@/app/ui/Modal_NewTaskForm', () => ({
  ModalNewTaskForm: () => null,
}))

jest.mock('@/app/ui/TaskBoard', () => ({
  TaskBoard: () => null,
}))

jest.mock('@/components/templates/SilentError', () => ({
  SilentError: () => null,
}))

jest.mock('@/hoc/ClientSideStateUpdate', () => ({
  ClientSideStateUpdate: ({ children }: { children: ReactNode }) => children,
}))

jest.mock('@/hoc/RealTime', () => ({
  RealTime: ({ children }: { children: ReactNode }) => children,
}))

jest.mock('@/hoc/RealtimeTemplates', () => ({
  RealTimeTemplates: ({ children }: { children: ReactNode }) => children,
}))

describe('home page redirects', () => {
  const originalFetch = global.fetch
  const clientCompanyTokenPayload: Token = {
    clientId: 'client-id',
    companyId: 'company-id',
    workspaceId: 'workspace-id',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetTokenPayload.mockResolvedValue(clientCompanyTokenPayload)
    global.fetch = jest.fn() as typeof fetch
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  it('redirects company-scoped tokens to the client portal before fetching board data', async () => {
    const redirectError = new Error('NEXT_REDIRECT_CLIENT_PORTAL')
    mockRedirectToClientPortal.mockImplementation(() => {
      throw redirectError
    })

    const { default: Main } = await import('@/app/(home)/page')

    await expect(Main({ searchParams: Promise.resolve({ token: 'client-token' }) })).rejects.toThrow(
      'NEXT_REDIRECT_CLIENT_PORTAL',
    )

    expect(mockRedirectIfTaskCta).toHaveBeenCalledWith({ token: 'client-token' }, 'client')
    expect(mockRedirectToClientPortal).toHaveBeenCalledWith('client-token')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('keeps task CTA redirects ahead of the generic client portal redirect', async () => {
    const redirectError = new Error('NEXT_REDIRECT_TASK_DETAIL')
    mockRedirectIfTaskCta.mockImplementation(() => {
      throw redirectError
    })

    const { default: Main } = await import('@/app/(home)/page')

    await expect(
      Main({ searchParams: Promise.resolve({ token: 'client-token', taskId: 'task-id' }) }),
    ).rejects.toThrow('NEXT_REDIRECT_TASK_DETAIL')

    expect(mockRedirectToClientPortal).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
