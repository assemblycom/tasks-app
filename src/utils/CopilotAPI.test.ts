const mockCreateNotification = jest.fn()

jest.mock('copilot-node-sdk', () => ({
  copilotApi: jest.fn(() => ({
    createNotification: mockCreateNotification,
  })),
}))

jest.mock('@/config', () => ({
  APP_ID: '00000000-0000-0000-0000-000000000000',
  assemblyApiDomain: 'https://api.example.com',
  copilotAPIKey: 'test-api-key',
}))

jest.mock('@/app/api/core/utils/withRetry', () => ({
  withRetry: jest.fn((fn, args) => fn(...args)),
}))

import { CopilotAPI } from './CopilotAPI'

describe('CopilotAPI#createNotification', () => {
  beforeEach(() => {
    mockCreateNotification.mockReset()
  })

  it('returns null when Copilot does not create a resource for email-only delivery', async () => {
    mockCreateNotification.mockResolvedValueOnce(null)
    const copilot = new CopilotAPI('test-token')

    await expect(
      copilot._createNotification({
        senderId: 'sender-id',
        senderType: 'internalUser',
        recipientClientId: 'recipient-id',
        deliveryTargets: {
          email: {
            subject: 'Reminder',
          },
        },
      }),
    ).resolves.toBeNull()
  })

  it('throws a clear error when an in-product delivery does not create a resource', async () => {
    mockCreateNotification.mockResolvedValueOnce(null)
    const copilot = new CopilotAPI('test-token')

    await expect(
      copilot._createNotification({
        senderId: 'sender-id',
        senderType: 'internalUser',
        recipientInternalUserId: 'recipient-id',
        deliveryTargets: {
          inProduct: {
            title: 'Reminder',
          },
        },
      }),
    ).rejects.toThrow('CopilotAPI#createNotification returned no notification for an in-product delivery')
  })
})
