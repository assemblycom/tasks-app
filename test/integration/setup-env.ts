import { readFileSync } from 'node:fs'

import DBClient from '@/lib/db'

import { disconnectTestDb } from './db'
import { DB_URL_FILE } from './paths'

// Runs in every worker before any test. next/jest loads the dev .env (pointing DATABASE_URL
// at a real DB) into the worker, so we override it here — last word before DBClient lazily
// reads process.env — to guarantee the SUT only ever touches the ephemeral container.
const url = readFileSync(DB_URL_FILE, 'utf8').trim()
process.env.DATABASE_URL = url
process.env.DIRECT_URL = url

// DBClient registers a beforeExit handler that calls process.exit(); under jest that trips the
// "process.exit called" guard. Disconnect both clients and strip the handler so the worker
// exits on its own.
afterAll(async () => {
  await disconnectTestDb()
  try {
    await DBClient.getInstance().$disconnect()
  } catch {
    /* DBClient was never instantiated in this file */
  }
  process.removeAllListeners('beforeExit')
})
