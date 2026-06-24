const ORIGINAL_ENV = process.env

afterEach(() => {
  jest.resetModules()
  jest.dontMock('@/lib/db')
  jest.dontMock('@/utils/CopilotAPI')
  process.env = ORIGINAL_ENV
})

describe('ValidateCountService', () => {
  it('skips reconciliation when the Tasks app id is not configured', async () => {
    const getClientNotifications = jest.fn()

    jest.resetModules()
    process.env = {
      ...ORIGINAL_ENV,
      COPILOT_API_KEY: 'api-key',
      COPILOT_APP_ID: undefined,
      COPILOT_APP_API_KEY: undefined,
      NEXT_PUBLIC_ASSEMBLY_API_DOMAIN: 'https://api.example.com',
    }

    jest.doMock('@/lib/db', () => ({
      __esModule: true,
      default: {
        getInstance: jest.fn(() => ({})),
      },
    }))
    jest.doMock('@/utils/CopilotAPI', () => ({
      CopilotAPI: jest.fn(() => ({ getClientNotifications })),
    }))

    const { ValidateCountService } = await import('./validateCount.service')
    const service = new ValidateCountService({
      token: 'token',
      clientId: '11111111-1111-4111-8111-111111111111',
      companyId: '22222222-2222-4222-8222-222222222222',
      workspaceId: 'workspace-id',
    } as any)

    await service.fixClientNotificationCount(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'workspace-id',
    )

    expect(getClientNotifications).not.toHaveBeenCalled()
  })
})
