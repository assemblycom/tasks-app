const mockCreateNotification = jest.fn()

jest.mock('@/config', () => ({
  APP_ID: 'app_1',
  assemblyApiDomain: 'https://api.example.com',
  copilotAPIKey: 'test-api-key',
}))

jest.mock('@/app/api/core/utils/withRetry', () => ({
  withRetry: (fn: (...args: unknown[]) => Promise<unknown>, args: unknown[]) => fn(...args),
}))

jest.mock('copilot-node-sdk', () => ({
  copilotApi: jest.fn(() => ({
    createNotification: mockCreateNotification,
  })),
}))

import { CopilotAPI } from '@/utils/CopilotAPI'
import { NotificationRequestBody } from '@/types/common'

const payload: NotificationRequestBody = {
  senderId: 'iu_1',
  senderType: 'internalUser',
  recipientClientId: 'client_1',
  recipientCompanyId: 'company_1',
  deliveryTargets: {
    email: {
      subject: 'Reminder',
      title: 'View task',
    },
  },
}

describe('CopilotAPI.createNotificationOptionalResponse', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns null when Copilot accepts the request without a response body', async () => {
    mockCreateNotification.mockResolvedValueOnce(null)

    const copilot = new CopilotAPI('', 'workspace/test-api-key')

    await expect(copilot.createNotificationOptionalResponse(payload)).resolves.toBeNull()
    expect(mockCreateNotification).toHaveBeenCalledWith({ requestBody: payload })
  })

  it('still validates and returns a notification object when Copilot sends one', async () => {
    mockCreateNotification.mockResolvedValueOnce({ id: 'notif_1', createdAt: '2026-05-25T00:00:00Z' })

    const copilot = new CopilotAPI('', 'workspace/test-api-key')

    await expect(copilot.createNotificationOptionalResponse(payload)).resolves.toEqual({
      id: 'notif_1',
      createdAt: '2026-05-25T00:00:00Z',
    })
  })
})
