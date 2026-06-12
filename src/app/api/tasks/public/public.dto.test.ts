jest.mock('@/utils/CopilotAPI', () => ({ CopilotAPI: class {} }))

import { publicTaskCreateDtoSchemaFactory } from './public.dto'

const TOKEN = 'test-token'
const INTERNAL_USER_ID = '11111111-1111-1111-1111-111111111111'

const basePayload = {
  name: 'Review evaluation',
  status: 'todo' as const,
  internalUserId: INTERNAL_USER_ID,
}

describe('publicTaskCreateDtoSchemaFactory - email override', () => {
  const schema = publicTaskCreateDtoSchemaFactory(TOKEN)

  it('parses a full email override object', async () => {
    const email = {
      subject: 'Action Required: Collection Mystery Shop',
      header: 'A new evaluation is ready',
      body: '<p>Please review the attached evaluation.</p>',
      title: 'Review Evaluations',
    }
    const result = await schema.parseAsync({ ...basePayload, email })
    expect(result.email).toEqual(email)
  })

  it('accepts a partial email override (omitted fields fall back downstream)', async () => {
    const result = await schema.parseAsync({ ...basePayload, email: { subject: 'Just a subject' } })
    expect(result.email).toEqual({ subject: 'Just a subject' })
  })

  it('leaves email undefined when not provided', async () => {
    const result = await schema.parseAsync(basePayload)
    expect(result.email).toBeUndefined()
  })

  it('rejects non-string email fields', async () => {
    await expect(schema.parseAsync({ ...basePayload, email: { subject: 123 } })).rejects.toThrow()
  })
})
