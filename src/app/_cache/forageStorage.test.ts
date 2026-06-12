import localforage from 'localforage'
import { getAssignees, migrateAssignees, setAssignees } from './forageStorage'

jest.mock('localforage', () => ({
  __esModule: true,
  default: {
    config: jest.fn(),
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}))

const mockedLocalforage = jest.mocked(localforage)

describe('forageStorage', () => {
  const originalWindow = global.window
  const originalDocument = global.document
  const originalLocalStorage = global.localStorage

  const defineBrowserGlobals = ({
    hasStorageAccess,
    requestStorageAccess = jest.fn(),
  }: {
    hasStorageAccess: jest.Mock<Promise<boolean>, []>
    requestStorageAccess?: jest.Mock<Promise<void>, []>
  }) => {
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: {},
    })
    Object.defineProperty(global, 'document', {
      configurable: true,
      value: {
        hasStorageAccess,
        requestStorageAccess,
      },
    })
    Object.defineProperty(global, 'localStorage', {
      configurable: true,
      value: {
        getItem: jest.fn(),
        removeItem: jest.fn(),
      },
    })
  }

  afterEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: originalWindow,
    })
    Object.defineProperty(global, 'document', {
      configurable: true,
      value: originalDocument,
    })
    Object.defineProperty(global, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    })
  })

  it('skips assignee reads when the browser denies storage access', async () => {
    const requestStorageAccess = jest.fn<Promise<void>, []>()
    defineBrowserGlobals({
      hasStorageAccess: jest.fn().mockResolvedValue(false),
      requestStorageAccess,
    })

    await expect(getAssignees('client.company')).resolves.toEqual([])

    expect(mockedLocalforage.getItem).not.toHaveBeenCalled()
    expect(requestStorageAccess).not.toHaveBeenCalled()
  })

  it('skips assignee writes when the browser denies storage access', async () => {
    const requestStorageAccess = jest.fn<Promise<void>, []>()
    defineBrowserGlobals({
      hasStorageAccess: jest.fn().mockResolvedValue(false),
      requestStorageAccess,
    })

    await setAssignees('client.company', [{ id: 'assignee-1' }])

    expect(mockedLocalforage.setItem).not.toHaveBeenCalled()
    expect(requestStorageAccess).not.toHaveBeenCalled()
  })

  it('does not touch localStorage migration when storage access is denied', async () => {
    const requestStorageAccess = jest.fn<Promise<void>, []>()
    defineBrowserGlobals({
      hasStorageAccess: jest.fn().mockResolvedValue(false),
      requestStorageAccess,
    })

    await migrateAssignees('client.company')

    expect(global.localStorage.getItem).not.toHaveBeenCalled()
    expect(mockedLocalforage.setItem).not.toHaveBeenCalled()
    expect(requestStorageAccess).not.toHaveBeenCalled()
  })
})
