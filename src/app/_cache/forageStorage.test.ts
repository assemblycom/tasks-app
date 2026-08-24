const mockGetItem = jest.fn()
const mockSetItem = jest.fn()

jest.mock('localforage', () => ({
  __esModule: true,
  default: {
    config: jest.fn(),
    getItem: (...args: unknown[]) => mockGetItem(...args),
    setItem: (...args: unknown[]) => mockSetItem(...args),
  },
}))

import { getAssignees, setAssignees } from '@/app/_cache/forageStorage'

const denied = () => new DOMException('Access is denied for this document.', 'SecurityError')

describe('assignee cache', () => {
  beforeAll(() => {
    globalThis.window = {} as Window & typeof globalThis
  })
  afterAll(() => {
    delete (globalThis as { window?: unknown }).window
  })
  beforeEach(() => jest.clearAllMocks())

  it('returns an empty list when storage access is denied', async () => {
    mockGetItem.mockRejectedValue(denied())

    await expect(getAssignees('lookup-key')).resolves.toEqual([])
    expect(mockGetItem).toHaveBeenCalledWith('assignees.lookup-key')
  })

  it('swallows write failures when storage access is denied', async () => {
    mockSetItem.mockRejectedValue(denied())

    await expect(setAssignees('lookup-key', [])).resolves.toBeUndefined()
    expect(mockSetItem).toHaveBeenCalledWith('assignees.lookup-key', [])
  })

  it('returns an empty list when nothing is cached', async () => {
    mockGetItem.mockResolvedValue(null)

    await expect(getAssignees('lookup-key')).resolves.toEqual([])
  })
})
