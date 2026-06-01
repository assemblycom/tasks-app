import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

// Real-Postgres integration tests. A testcontainer is booted once in globalSetup, migrated,
// and torn down after. Kept separate from the default `jest` run, which has no DB.
const config: Config = {
  testEnvironment: 'node',
  testMatch: ['**/*.integration.test.ts'],
  globalSetup: '<rootDir>/test/integration/globalSetup.ts',
  globalTeardown: '<rootDir>/test/integration/globalTeardown.ts',
  setupFilesAfterEnv: ['<rootDir>/test/integration/setup-env.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@api/(.*)$': '<rootDir>/src/app/api/$1',
  },
  collectCoverage: false,
  // One Postgres, shared serially: parallel workers would race truncateAll between tests.
  maxWorkers: 1,
  testTimeout: 30000,
}

export default createJestConfig(config)
