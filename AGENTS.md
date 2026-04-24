# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Task App is a full-stack Next.js 16 task management application using React 19, Material UI, Prisma ORM (PostgreSQL via Supabase), and Trigger.dev for background jobs. It is a single-service app (not a monorepo).

### Node version

The project requires Node.js v20 (see `.nvmrc` for exact version). Use `nvm use` to activate.

### Package manager

Yarn Classic 1.22.22 (via corepack). The lockfile is `yarn.lock`.

### Key commands

| Task | Command |
|------|---------|
| Install deps | `yarn install` (runs `prisma generate` via postinstall) |
| Dev server | `yarn dev` (Next.js on port 3000) |
| Lint (ESLint) | `yarn lint:check` |
| Prettier | `yarn prettier:check` |
| Tests (Jest) | `yarn test` |
| Prisma migrations | `npx prisma migrate deploy` |

### Database

The app uses a remote Supabase-hosted PostgreSQL database. Connection details are injected via `DATABASE_URL` and `DIRECT_URL` environment secrets. No local database setup is needed when these secrets are configured.

### Authentication

The app authenticates users via Copilot platform tokens (`COPILOT_API_KEY`). Without a valid token, the UI shows "Please provide a Valid Token". This is expected behavior in local development without an embedded Copilot context. The API health-check endpoint (`/api/health-check`) works without authentication and confirms DB + Trigger.dev connectivity.

### Gotchas

- `yarn lint` (`next lint`) in Next.js 16 misinterprets "lint" as a directory argument. Use `yarn lint:check` instead for ESLint.
- Jest requires `ts-node` to parse `jest.config.ts`. It is not listed in `package.json` dependencies but is needed at dev time.
- Two pre-existing test failures exist in the repo: `authenticate.test.ts` (ESM `p-retry` import issue) and `withErrorHandler.test.ts` (assertion mismatch). These are not caused by environment setup.
- The `postinstall` script runs `prisma generate` automatically during `yarn install`.
- The `prepare` script runs `husky install` to set up git hooks (pre-commit runs `lint-staged`).
