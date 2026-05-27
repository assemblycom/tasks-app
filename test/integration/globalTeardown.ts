import { rmSync } from 'node:fs'

import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'

import { DB_URL_FILE } from './paths'

export default async function globalTeardown(): Promise<void> {
  const container = (globalThis as unknown as { __PG__?: StartedPostgreSqlContainer }).__PG__
  await container?.stop()
  try {
    rmSync(DB_URL_FILE)
  } catch {
    /* already gone */
  }
}
