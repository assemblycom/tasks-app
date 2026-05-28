import os from 'node:os'
import path from 'node:path'

// globalSetup writes the testcontainer's connection URL here; globalTeardown removes it and
// each worker's setup-env reads it. Kept out of the repo tree (os.tmpdir) on purpose.
export const DB_URL_FILE = path.join(os.tmpdir(), 'tasks-app-integration-db-url')
