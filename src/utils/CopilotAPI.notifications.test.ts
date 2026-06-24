const ORIGINAL_ENV = process.env

const APP_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_APP_ID = '22222222-2222-4222-8222-222222222222'
const COMPANY_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_COMPANY_ID = '44444444-4444-4444-8444-444444444444'

const loadCopilotAPI = async (env: Record<string, string | undefined> = {}) => {
  jest.resetModules()
  process.env = {
    ...ORIGINAL_ENV,
    COPILOT_API_KEY: 'api-key',
    NEXT_PUBLIC_ASSEMBLY_API_DOMAIN: 'https://api.example.com',
    ...env,
  }

  jest.doMock('copilot-node-sdk', () => ({
    copilotApi: jest.fn(() => ({})),
  }))
  jest.doMock('@/app/api/core/utils/withRetry', () => ({
    withRetry: jest.fn((fn, args) => fn(...args)),
  }))

  return import('@/utils/CopilotAPI')
}

afterEach(() => {
  jest.resetModules()
  jest.dontMock('copilot-node-sdk')
  jest.dontMock('@/app/api/core/utils/withRetry')
  process.env = ORIGINAL_ENV
})

describe('CopilotAPI#getClientNotifications', () => {
  it('does not call Copilot when the Tasks app id is not configured', async () => {
    const { CopilotAPI } = await loadCopilotAPI({
      COPILOT_APP_ID: undefined,
      COPILOT_APP_API_KEY: undefined,
    })
    const copilot = new CopilotAPI('token') as any
    copilot.manualFetch = jest.fn()

    await expect(copilot._getClientNotifications('client-id', COMPANY_ID, 'workspace-id', { limit: 100 })).resolves.toEqual(
      [],
    )
    expect(copilot.manualFetch).not.toHaveBeenCalled()
  })

  it('filters Copilot notifications to the configured Tasks app and recipient company', async () => {
    const { CopilotAPI } = await loadCopilotAPI({ COPILOT_APP_ID: APP_ID })
    const copilot = new CopilotAPI('token') as any
    copilot.manualFetch = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'matching-recipient-company',
          appId: APP_ID,
          createdAt: '2026-06-24T00:00:00.000Z',
          recipientCompanyId: COMPANY_ID,
        },
        { id: 'matching-company', appId: APP_ID, createdAt: '2026-06-24T00:00:00.000Z', companyId: COMPANY_ID },
        {
          id: 'different-company',
          appId: APP_ID,
          createdAt: '2026-06-24T00:00:00.000Z',
          recipientCompanyId: OTHER_COMPANY_ID,
        },
        { id: 'different-app', appId: OTHER_APP_ID, createdAt: '2026-06-24T00:00:00.000Z', recipientCompanyId: COMPANY_ID },
      ],
    })

    await expect(copilot._getClientNotifications('client-id', COMPANY_ID, 'workspace-id', { limit: 100 })).resolves.toEqual([
      {
        id: 'matching-recipient-company',
        appId: APP_ID,
        createdAt: '2026-06-24T00:00:00.000Z',
        recipientCompanyId: COMPANY_ID,
      },
      { id: 'matching-company', appId: APP_ID, createdAt: '2026-06-24T00:00:00.000Z', companyId: COMPANY_ID },
    ])
    expect(copilot.manualFetch).toHaveBeenCalledWith(
      'notifications',
      {
        recipientClientId: 'client-id',
        recipientCompanyId: COMPANY_ID,
        limit: '100',
      },
      'workspace-id',
    )
  })
})
