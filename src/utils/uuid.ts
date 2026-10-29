import { z } from 'zod'

export const NIL_UUID = '00000000-0000-0000-0000-000000000000' as const

export const isNilUuid = (id: string | null | undefined): id is typeof NIL_UUID => id === NIL_UUID

export const isUuid = (id: string | null | undefined): boolean =>
  typeof id === 'string' && z.string().uuid().safeParse(id).success
