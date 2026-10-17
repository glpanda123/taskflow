# TaskFlow

Multi-tenant task manager for small teams (3–15 people): workspaces, role-based access, a live board, and an AI assistant that drafts tasks.

Built contract-first: an OpenAPI spec is the single source of truth for the web app, the mock API and (later) the NestJS backend.

Status: prototype in progress.

## Repository layout

```
apps/
  web/                Next.js (App Router) + Tailwind — the UI
packages/
  api-contract/       openapi.yaml + generated TypeScript types (shared by web, mocks, api)
```

## Getting started

Requires Node 22 and pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm dev          # all apps in watch mode (Turborepo)
pnpm lint         # ESLint + OpenAPI lint (Redocly)
pnpm typecheck    # tsc --noEmit (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes)
pnpm build
pnpm format       # Prettier
```

CI runs a contract-types freshness check, format check, lint, typecheck and build on every pull request.

## API contract (contract-first)

`packages/api-contract/openapi.yaml` (OpenAPI 3.1) is the single source of truth for the API.

```bash
# after editing openapi.yaml
pnpm --filter @taskflow/api-contract generate   # → src/generated/schema.ts + openapi.json
pnpm --filter @taskflow/api-contract lint       # Redocly rules (redocly.yaml)
```

Generated files are committed so contract changes show up in PR diffs; CI fails if they are stale.
Browse the contract with Swagger UI at http://localhost:3000/api-docs while `pnpm dev` runs.
