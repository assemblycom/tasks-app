import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql'

import { DB_URL_FILE } from './paths'

// Boots an ephemeral Postgres, applies all migrations, and publishes its URL so the SUT
// (which reads process.env.DATABASE_URL via DBClient) and the test client both hit it.
export default async function globalSetup(): Promise<void> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start()
  const url = container.getConnectionUri()

  // `prisma migrate deploy` runs the real migration history (incl. CREATE EXTENSION ltree),
  // so the schema matches prod exactly. dotenv won't override the env we pass explicitly,
  // so the container URL wins over the dev .env DATABASE_URL/DIRECT_URL.
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  })

  writeFileSync(DB_URL_FILE, url, 'utf8')
  process.env.DATABASE_URL = url
  process.env.DIRECT_URL = url
  ;(globalThis as unknown as { __PG__?: StartedPostgreSqlContainer }).__PG__ = container
}
