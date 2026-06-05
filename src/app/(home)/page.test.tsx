import Main from './page'
import { redirect } from 'next/navigation'

const getTokenPayload = jest.fn()

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation(() => ({
    getTokenPayload,
  })),
}))

jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
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
  ClientSideStateUpdate: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('@/hoc/RealTime', () => ({
  RealTime: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('@/hoc/RealtimeTemplates', () => ({
  RealTimeTemplates: ({ children }: { children: React.ReactNode }) => children,
}))

describe('home page routing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  it('redirects company-scoped tokens before fetching internal board data', async () => {
    getTokenPayload.mockResolvedValue({
      clientId: '8f792aee-7b3a-4ee6-ae3c-f086d9bf72a8',
      companyId: '2e8c39e9-eb18-4d57-af7e-25bf967e1935',
      workspaceId: 'workspace-id',
    })

    await expect(Main({ searchParams: Promise.resolve({ token: 'client-token' }) })).rejects.toThrow(
      'NEXT_REDIRECT:/client?token=client-token',
    )

    expect(redirect).toHaveBeenCalledWith('/client?token=client-token')
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
