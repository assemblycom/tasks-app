# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Task App is a Copilot/Assembly app-store app for task management across Internal Users (IU), Clients, and Companies. Full-stack Next.js (App Router, React 19) — Server + Client Components, Material UI + `copilot-design-system` for UI. Supabase (Postgres + Realtime) is the datastore, accessed through Prisma. Trigger.dev runs long-running async work (notifications, reminders). Deployed on Vercel. Sentry for errors.

## Commands

Package manager is **yarn** (yarn 1.22, see `packageManager` in package.json). Node >= 20 (`.nvmrc` pins v20.19.1).

> Note: `mise.toml` defines an alternate local toolchain (bun + node 24 + `portless`). The canonical/CI path is yarn — prefer it unless working specifically in the mise/portless setup.

- `yarn dev` — dev server
- `yarn build` — `next build` (CI/Vercel uses `./scripts/build.sh`, which also runs `prisma migrate deploy`, grants Supabase privileges, and seeds task paths)
- `yarn tsc` — typecheck (`tsc --noEmit`)
- `yarn lint:check` / `yarn lint:fix` — ESLint over `{src,test}`
- `yarn prettier:check` / `yarn prettier:fix`

### Tests

- `yarn test` — unit tests via Jest. **No database.** `*.integration.test.ts` files are excluded here.
- `yarn test:integration` — integration tests against a **real Postgres** booted in a testcontainer (`jest.integration.config.ts`, `--runInBand`, single worker). Requires Docker. Setup/teardown in `test/integration/`.
- Single test file: `yarn test path/to/file.test.ts` (or `yarn test:integration path/to/file.integration.test.ts`)
- Filter by name: append `-t "test name"`

Two distinct test tiers: pure unit (`*.test.ts`) and DB-backed (`*.integration.test.ts`). Pick the suffix based on whether the test needs Postgres.

### Prisma & data backfills

- Prisma schema is **split across files** under `prisma/schema/` (`prismaSchemaFolder` preview feature). Edit the relevant `*.prisma` file, not a single monolith. `postinstall` runs `prisma generate`.
- One-off data scripts live in `src/cmd/` and run via `tsx`, exposed as `yarn cmd:*` scripts (e.g. `yarn cmd:backfill-attachments`). Use these patterns for migrations of existing data.

### Trigger.dev

- `yarn trigger` (dev), `yarn trigger:deploy-staging`. Jobs live in `src/jobs/` (configured in `trigger.config.ts`).

## Architecture

### Request → response pipeline (API routes)

Every API route follows the same layered pattern. Trace `src/app/api/tasks/` as the canonical example:

1. **`route.ts`** — thin. Maps HTTP verbs to controller fns wrapped in `withErrorHandler` (and sometimes `withExecTimeCap`). e.g. `export const POST = withErrorHandler(createTask)`.
2. **`*.controller.ts`** — calls `authenticate(req)`, parses the body with a **Zod DTO** (`*.dto.ts` in `src/types/dto/`), instantiates a service, returns `NextResponse.json`. No business logic.
3. **`*.service.ts`** — business logic. Extends `BaseService` (gives `this.db` = Prisma client, `this.user`, `this.copilot` = CopilotAPI). Authorization is enforced here via `PoliciesService.authorize(action, resource)`.

When adding an endpoint, replicate this 3-layer split — don't put logic in routes or controllers.

### Auth & the User model

- `authenticate(req)` (`src/app/api/core/utils/authenticate.ts`) reads `?token=` from the query string, validates it via `CopilotAPI`, and returns a `User`. **Token-in-query is the intended Copilot embed auth convention — do not flag it as a security issue.**
- `User` (`core/models/User.model.ts`) is a faux model derived from the decrypted token payload: `role` (IU vs Client), `workspaceId`, `clientId`, `companyId`, `internalUserId`. Role is IU iff `internalUserId` is present.
- **Authorization**: `PoliciesService` (`core/services/policies.service.ts`). IUs get unrestricted access; Clients get a per-`Resource` action allowlist. Tighten/loosen access there, not ad-hoc in services.

### CopilotAPI wrapper

`src/utils/CopilotAPI.ts` wraps `copilot-node-sdk` plus manual REST calls to the Assembly core API. All external user/client/company/notification data and token validation flow through it. Rate-limited with Bottleneck, retried with `withRetry`. Services reach it via `this.copilot`.

### Database access

- `DBClient.getInstance()` (`src/lib/db.ts`) — singleton Prisma client with **soft-delete extensions** (`prismaExtensions.ts`): `softDelete`, `softDeleteMany`, `filterSoftDeleted`. Queries automatically exclude soft-deleted rows; deletes are soft by default. Be aware of this when reasoning about what a query returns.
- **Task hierarchy uses Postgres `ltree`.** Tasks form a tree; the materialized path is stored as an ltree column. Helpers in `src/utils/ltree.ts` (`buildLtree`, `getIdsFromLtreePath`) — UUIDs are lowercased and `-`→`_` to be valid ltree labels. Subtask/path traversal logic depends on this.

### Realtime

- Supabase Realtime drives live updates. `src/lib/realtime.ts` (`RealtimeHandler`) processes `postgres_changes` payloads on the client, reconciles them into Redux, and filters by `workspaceId` and assignee/shared scope. The build step grants anon privileges (`yarn db:grant-supabase-privileges`) so the channel works with only a Copilot token.
- Client state is Redux Toolkit (`src/redux/`); data fetching is SWR (`src/lib/swr-config.ts`). Optimistic update utils live in `src/utils/optimistic*.ts` and `cascadeOptimistic.ts`.

### Public API

`src/app/api/tasks/public/` is the externally-documented automation API (controller/service/dto/serializer split, plus `ValidateUuid` guards). It has its own serializers and stricter validation than the internal app routes. See `docs/PUBLIC_ATTACHMENT_FLOW.md` for the attachment-staging flow (markers → download → Supabase → ScrapMedia → post-create sweep), which is non-obvious and easy to break.

### Error handling

Throw `APIError(status, message)` (`core/exceptions/api.ts`) from anywhere in the stack. `withErrorHandler` catches and normalizes `APIError`, `ZodError` (→422), `CopilotApiError`, and Prisma `P2025` (→404) into a consistent `{ error, errors }` JSON shape. Don't hand-roll error responses.

### Notifications & jobs

`src/jobs/` (Trigger.dev tasks) and `src/app/api/workers/` (cron-triggered routes, e.g. `scrap-medias` reaping orphaned uploads, scheduled in `vercel.json`). Notification eligibility logic is in `src/jobs/notifications/eligibility.ts` and is heavily tested (both unit and integration).

## Conventions

- Path aliases: `@/*` → `src/*`, `@api/*` → `src/app/api/*`, `@cmd/*` → `src/cmd/*`.
- DTOs and request/response shapes are Zod schemas (`src/types/dto/`, `src/types/common.ts`) — parse at the boundary, infer types from schemas.
- `'use client'` only where interactivity is needed; default to Server Components.
- SVGs import as React components via `@svgr/webpack` (configured in `next.config.js` turbopack rules).
- lint-staged + Husky run `lint:fix` and `prettier:fix` on staged `src/**/*.{ts,tsx}` pre-commit.

## Coding Standard

Other than the rules defined and enforced via Prettier and ESLint, follow these standards:

### KISS (Keep It Simple)

Prefer the simplest solution that solves the problem well.

Guidelines:

- Keep functions, components, and services focused on a single responsibility.
- Prefer composition over deeply nested logic.
- Avoid premature abstractions.
- Favor explicit, readable code over clever code.
- Prefer guard clauses and early returns over nested conditionals.

Complexity Targets:

- Functions: ideally <= 30 lines.
- Components: ideally <= 150 lines.
- Files: ideally <= 300 lines.
- Nesting depth: avoid more than 3 levels of nesting.

If a function requires significant scrolling to understand, consider extracting helpers.

### DRY (Don't Repeat Yourself)

Eliminate duplication when it improves maintainability.

Guidelines:

- Extract shared business logic into reusable functions or services.
- Prefer readability over aggressive abstraction.
- Duplicate once if necessary; consider abstraction on the third occurrence.
- Do not introduce abstractions that make code harder to understand.

### Function Design

- Functions should do one thing.
- Prefer pure functions whenever possible.
- For functions with more than one parameter, prefer an object parameter instead of positional arguments.
- Avoid boolean flag parameters when possible. Split into separate functions instead.
- Prefer small focused helpers over large utility functions.

### Type Safety

- Prefer explicit types over implicit assumptions.
- Prefer well-typed interfaces and Zod schemas.
- Prefer `unknown` over `any`.
- Avoid type assertions unless unavoidable.
- Infer types from schemas whenever possible.

### React

- Default to Server Components.
- Use Client Components only when interactivity is required.
- Do not use `forwardRef`. React 19 supports refs as props.
- Keep components focused on presentation or orchestration, not both.
- Extract hooks for reusable stateful logic.

### Comments

Code should be self-explanatory whenever possible.

Avoid comments that describe what the code is doing.

Prefer comments that explain:

- Why something exists.
- Business constraints.
- Non-obvious decisions.
- External system quirks.

Keep comments concise and focused.

### Error Handling

- Fail fast.
- Prefer guard clauses and early returns.
- Do not swallow errors.
- Avoid deeply nested try/catch blocks.
- Catch errors only when they can be meaningfully handled.

### Data Fetching

- When running on the server, prefer calling server functions directly.
- Do not call internal API routes from SSR or Server Components.
- API routes should act as boundaries for external consumers.
- Reuse service-layer logic instead of making unnecessary HTTP requests.

### Decision Framework

When multiple solutions are possible, prioritize:

1. Correctness
2. Simplicity
3. Readability
4. Maintainability
5. Performance
6. Reusability

Do not introduce complexity for theoretical future requirements.
