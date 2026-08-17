import {
  isNoCompanyClientsMessageChannelError,
  isSenderCompanyIdInvalidError,
  NO_COMPANY_CLIENTS_MESSAGE_CHANNEL,
} from './copilotError'

describe('copilotError', () => {
  it('detects the no-company-clients message channel body message', () => {
    expect(
      isNoCompanyClientsMessageChannelError({
        message: NO_COMPANY_CLIENTS_MESSAGE_CHANNEL,
        body: { message: NO_COMPANY_CLIENTS_MESSAGE_CHANNEL },
      }),
    ).toBe(true)
  })

  it('detects the no client users found for company wrapper message', () => {
    expect(
      isNoCompanyClientsMessageChannelError({
        message: 'No client users found for company: code [not_found]',
        body: { message: NO_COMPANY_CLIENTS_MESSAGE_CHANNEL },
      }),
    ).toBe(true)
  })

  it('detects sender company ID invalid errors', () => {
    expect(
      isSenderCompanyIdInvalidError({
        message: 'sender company ID is invalid based on sender',
        body: { message: 'sender company ID is invalid based on sender' },
      }),
    ).toBe(true)
  })
})
