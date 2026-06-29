import { PrismaClientInitializationError, PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

const retryablePrismaErrorCodes = new Set(['P1001', 'P1002', 'P1008', 'P1017'])

type DbRetryOptions = {
  maxAttempts: number
  factor: number
  minTimeoutMs: number
  maxTimeoutMs: number
  randomize: boolean
}

type PrismaConnectionErrorLike = {
  code?: string
  errorCode?: string
  message?: string
  name?: string
}

type WithDbRetryParams<T> = {
  operation: () => Promise<T>
  options?: Partial<DbRetryOptions>
}

type RetryParams<T> = {
  operation: () => Promise<T>
  options: DbRetryOptions
  attemptNumber: number
}

const defaultDbRetryOptions: DbRetryOptions = {
  maxAttempts: 3,
  factor: 2,
  minTimeoutMs: 1_000,
  maxTimeoutMs: 5_000,
  randomize: true,
}

export const isRetryablePrismaConnectionError = (error: unknown): boolean => {
  if (error instanceof PrismaClientInitializationError) return true
  if (error instanceof PrismaClientKnownRequestError && retryablePrismaErrorCodes.has(error.code)) return true

  const prismaError = error as PrismaConnectionErrorLike
  return (
    prismaError.name === 'PrismaClientInitializationError' ||
    retryablePrismaErrorCodes.has(prismaError.code ?? '') ||
    retryablePrismaErrorCodes.has(prismaError.errorCode ?? '')
  )
}

export const withDbRetry = async <T>({ operation, options = {} }: WithDbRetryParams<T>): Promise<T> => {
  const retryOptions = { ...defaultDbRetryOptions, ...options }
  return retryOperation({ operation, options: retryOptions, attemptNumber: 1 })
}

const retryOperation = async <T>({ operation, options, attemptNumber }: RetryParams<T>): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    if (!isRetryablePrismaConnectionError(error) || attemptNumber >= options.maxAttempts) {
      throw error
    }

    console.warn('withDbRetry: transient Prisma connection failure', {
      attemptNumber,
      retriesLeft: options.maxAttempts - attemptNumber,
      message: getErrorMessage(error),
    })

    await wait(getDelayMs({ attemptNumber, options }))
    return retryOperation({ operation, options, attemptNumber: attemptNumber + 1 })
  }
}

const getErrorMessage = (error: unknown): string | undefined =>
  error && typeof error === 'object' && 'message' in error ? String(error.message) : undefined

const getDelayMs = ({ attemptNumber, options }: { attemptNumber: number; options: DbRetryOptions }): number => {
  const baseDelay = Math.min(options.minTimeoutMs * options.factor ** (attemptNumber - 1), options.maxTimeoutMs)
  if (!options.randomize) return baseDelay
  return Math.round(baseDelay * (1 + Math.random()))
}

const wait = async (delayMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, delayMs)
  })
