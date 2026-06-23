import React from 'react'
import Main from '@/app/(home)/page'
import TaskDetailPage from '@/app/detail/[task_id]/[user_type]/page'
import { TemplatesFetcher } from '@/app/_fetchers/TemplatesFetcher'
import type { Token } from '@/types/common'
import { UserType } from '@/types/interfaces'

let mockTokenPayload: Token
let mockAuthenticatedUser: Token

jest.mock('@/app/(home)/actions', () => ({
  createMultipleAttachments: jest.fn(),
}))

jest.mock('@/app/detail/[task_id]/[user_type]/actions', () => ({
  clientUpdateTask: jest.fn(),
  deleteAttachment: jest.fn(),
  deleteTask: jest.fn(),
  postAttachment: jest.fn(),
  updateAssignee: jest.fn(),
  updateTaskDetail: jest.fn(),
  updateWorkflowStateIdOfTask: jest.fn(),
}))

jest.mock('@/app/detail/[task_id]/[user_type]/loaders', () => ({
  loadSubtaskStatus: jest.fn(async () => ({ canCreateSubtask: false })),
  loadTask: jest.fn(async () => ({
    id: 'task_1',
    title: 'Task',
    label: 'Task',
    associations: [],
    assigneeId: null,
    workflowState: null,
  })),
  loadTaskPath: jest.fn(async () => []),
  loadViewSettings: jest.fn(async () => ({})),
}))

jest.mock('@/app/api/core/utils/authenticate', () => ({
  __esModule: true,
  default: jest.fn(),
  authenticateWithToken: jest.fn(async () => mockAuthenticatedUser),
}))

jest.mock('@/utils/CopilotAPI', () => ({
  CopilotAPI: jest.fn().mockImplementation(() => ({
    getTokenPayload: jest.fn(async () => mockTokenPayload),
  })),
}))

jest.mock('@/utils/redirect', () => ({
  redirectIfTaskCta: jest.fn(),
  redirectToClientPortal: jest.fn(),
}))

jest.mock('@/utils/assignee', () => ({
  getAssigneeCacheLookupKey: jest.fn(() => 'assignee-cache-key'),
}))

jest.mock('@/utils/taskViewer', () => ({
  checkIfTaskViewer: jest.fn(() => false),
}))

jest.mock('@mui/material', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => children,
  Stack: ({ children }: { children?: React.ReactNode }) => children,
}))

jest.mock('@/app/_cache/AssigneeCacheGetter', () => ({
  AssigneeCacheGetter: () => null,
}))

jest.mock('@/app/_fetchers/AllTasksFetcher', () => ({
  AllTasksFetcher: () => null,
}))

jest.mock('@/app/_fetchers/OneTaskDataFetcher', () => ({
  OneTaskDataFetcher: () => null,
}))

jest.mock('@/app/_fetchers/TemplatesFetcher', () => ({
  TemplatesFetcher: jest.fn(() => null),
}))

jest.mock('@/app/_fetchers/WorkflowStateFetcher', () => ({
  WorkflowStateFetcher: () => null,
}))

jest.mock('@/app/ui/Modal_NewTaskForm', () => ({
  ModalNewTaskForm: () => null,
}))

jest.mock('@/app/ui/TaskBoard', () => ({
  TaskBoard: () => null,
}))

jest.mock('@/app/detail/[task_id]/[user_type]/DetailStateUpdate', () => ({
  DetailStateUpdate: ({ children }: { children?: React.ReactNode }) => children,
}))

jest.mock('@/app/detail/ui/ActivityWrapper', () => ({
  ActivityWrapper: () => null,
}))

jest.mock('@/app/detail/ui/ArchiveWrapper', () => ({
  ArchiveWrapper: () => null,
}))

jest.mock('@/app/detail/ui/LastArchiveField', () => ({
  LastArchivedField: () => null,
}))

jest.mock('@/app/detail/ui/MenuBoxContainer', () => ({
  MenuBoxContainer: () => null,
}))

jest.mock('@/app/detail/ui/ResponsiveStack', () => ({
  ResponsiveStack: ({ children }: { children?: React.ReactNode }) => children,
}))

jest.mock('@/app/detail/ui/Sidebar', () => ({
  Sidebar: () => null,
}))

jest.mock('@/app/detail/ui/styledComponent', () => ({
  StyledBox: ({ children }: { children?: React.ReactNode }) => children,
  StyledTiptapDescriptionWrapper: ({ children }: { children?: React.ReactNode }) => children,
  TaskDetailsContainer: ({ children }: { children?: React.ReactNode }) => children,
}))

jest.mock('@/app/detail/ui/Subtasks', () => ({
  Subtasks: () => null,
}))

jest.mock('@/app/detail/ui/TaskEditor', () => ({
  TaskEditor: () => null,
}))

jest.mock('@/components/layouts/DeletedRedirectPage', () => ({
  DeletedRedirectPage: () => null,
}))

jest.mock('@/components/layouts/HeaderBreadcrumbs', () => ({
  HeaderBreadcrumbs: () => null,
}))

jest.mock('@/components/templates/SilentError', () => ({
  SilentError: () => null,
}))

jest.mock('@/hoc/AppMargin', () => ({
  AppMargin: ({ children }: { children?: React.ReactNode }) => children,
  SizeofAppMargin: { HEADER: 'HEADER' },
}))

jest.mock('@/hoc/ClientSideStateUpdate', () => ({
  ClientSideStateUpdate: ({ children }: { children?: React.ReactNode }) => children,
}))

jest.mock('@/hoc/PostAttachmentProvider', () => ({
  AttachmentProvider: ({ children }: { children?: React.ReactNode }) => children,
}))

jest.mock('@/hoc/RealTime', () => ({
  RealTime: ({ children }: { children?: React.ReactNode }) => children,
}))

jest.mock('@/hoc/RealtimeTemplates', () => ({
  RealTimeTemplates: ({ children }: { children?: React.ReactNode }) => children,
}))

jest.mock('@/utils/escapeHandler', () => ({
  __esModule: true,
  default: () => null,
}))

const createJsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
})

const setupFetch = () => {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.includes('/api/view-settings')) {
      return createJsonResponse({ showArchived: false, showUnarchived: true })
    }

    if (url.includes('/api/workflow-states')) {
      return createJsonResponse({ workflowStates: [] })
    }

    return createJsonResponse({ tasks: [] })
  }) as jest.Mock
}

const hasElementType = (node: React.ReactNode, type: unknown): boolean => {
  if (Array.isArray(node)) {
    return node.some((child) => hasElementType(child, type))
  }

  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return false
  }

  return node.type === type || hasElementType(node.props.children, type)
}

describe('task template fetching in server pages', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setupFetch()
  })

  it('does not render the template fetcher for normal client tokens on the home page', async () => {
    mockTokenPayload = { clientId: 'client_1', workspaceId: 'workspace_1' }

    const tree = await Main({ searchParams: Promise.resolve({ token: 'client-token' }) })

    expect(hasElementType(tree, TemplatesFetcher)).toBe(false)
  })

  it('renders the template fetcher for internal user tokens on the home page', async () => {
    mockTokenPayload = { internalUserId: 'iu_1', workspaceId: 'workspace_1' }

    const tree = await Main({ searchParams: Promise.resolve({ token: 'iu-token' }) })

    expect(hasElementType(tree, TemplatesFetcher)).toBe(true)
  })

  it('does not render the template fetcher for normal client tokens on task detail', async () => {
    mockAuthenticatedUser = { clientId: 'client_1', workspaceId: 'workspace_1' }

    const tree = await TaskDetailPage({
      params: Promise.resolve({ task_id: 'task_1', task_name: 'task', user_type: UserType.CLIENT_USER }),
      searchParams: Promise.resolve({ token: 'client-token' }),
    })

    expect(hasElementType(tree, TemplatesFetcher)).toBe(false)
  })

  it('renders the template fetcher for preview tokens on task detail', async () => {
    mockAuthenticatedUser = { internalUserId: 'iu_1', clientId: 'client_1', workspaceId: 'workspace_1' }

    const tree = await TaskDetailPage({
      params: Promise.resolve({ task_id: 'task_1', task_name: 'task', user_type: UserType.CLIENT_USER }),
      searchParams: Promise.resolve({ token: 'preview-token' }),
    })

    expect(hasElementType(tree, TemplatesFetcher)).toBe(true)
  })
})
