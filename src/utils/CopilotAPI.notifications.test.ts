const ORIGINAL_ENV = process.env

const APP_ID = '00000000-0000-4000-8000-000000000001'
const OTHER_APP_ID = '00000000-0000-4000-8000-000000000002'

const loadCopilotAPI = async () => {
  jest.resetModules()
  jest.doMock('copilot-node-sdk', () => ({
    copilotApi: jest.fn(() => ({})),
  }))

  return await import('@/utils/CopilotAPI')
}

const notification = (overrides: Record<string, unknown>) => ({
  id: 'notification-id',
  appId: APP_ID,
  createdAt: '2026-06-24T00:00:00.000Z',
  ...overrides,
})

describe('CopilotAPI client notification filtering', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      COPILOT_API_KEY: 'api-key',
      NEXT_PUBLIC_ASSEMBLY_API_DOMAIN: 'https://api.example.com',
    }
    delete process.env.COPILOT_APP_ID
    delete process.env.COPILOT_APP_API_KEY
  })

  afterEach(() => {
    jest.dontMock('copilot-node-sdk')
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('skips notification lookup when no Copilot app id is configured', async () => {
    const { CopilotAPI } = await loadCopilotAPI()
    const copilot = new CopilotAPI('token')
    const manualFetch = jest.fn()
    copilot.manualFetch = manualFetch

    const result = await copilot.getClientNotifications('client-1', 'company-1', 'workspace-1')

    expect(result).toEqual([])
    expect(manualFetch).not.toHaveBeenCalled()
  })

  it('filters Copilot notifications to the configured app and company', async () => {
    process.env.COPILOT_APP_ID = APP_ID
    const { CopilotAPI } = await loadCopilotAPI()
    const copilot = new CopilotAPI('token')
    const manualFetch = jest.fn().mockResolvedValue({
      data: [
        notification({ id: 'matching-recipient-company', recipientCompanyId: 'company-1' }),
        notification({ id: 'matching-task-company', companyId: 'company-1' }),
        notification({ id: 'other-app', appId: OTHER_APP_ID, recipientCompanyId: 'company-1' }),
        notification({ id: 'other-company', recipientCompanyId: 'company-2' }),
      ],
    })
    copilot.manualFetch = manualFetch

    const result = await copilot.getClientNotifications('client-1', 'company-1', 'workspace-1', { limit: 25 })

    expect(manualFetch).toHaveBeenCalledWith(
      'notifications',
      {
        recipientClientId: 'client-1',
        recipientCompanyId: 'company-1',
        limit: '25',
      },
      'workspace-1',
    )
    expect(result.map(({ id }) => id)).toEqual(['matching-recipient-company', 'matching-task-company'])
  })
})
