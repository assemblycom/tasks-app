import APIError from '@api/core/exceptions/api'
import httpStatus from 'http-status'

export const getSearchParams = <T extends string>(searchParams: URLSearchParams, fields: T[]): Record<T, string | null> => {
  return fields.reduce(
    (acc, key) => {
      acc[key] = searchParams.get(key)
      return acc
    },
    {} as Record<T, string | null>,
  )
}

export const getBooleanQuery = (val: string | null, defaultValue: boolean = false): boolean => {
  if (val === null) return defaultValue

  const falseyValues = ['0', 'false']
  return !falseyValues.includes(val)
}

const TRUTHY_BOOLEAN_VALUES = new Set(['1', 'true'])
const FALSY_BOOLEAN_VALUES = new Set(['0', 'false'])

export const parseStrictBooleanQuery = (val: string | null, { defaultValue }: { defaultValue: boolean }): boolean => {
  if (val === null) return defaultValue
  if (TRUTHY_BOOLEAN_VALUES.has(val)) return true
  if (FALSY_BOOLEAN_VALUES.has(val)) return false
  throw new APIError(httpStatus.BAD_REQUEST, `Invalid boolean value: "${val}"`)
}
