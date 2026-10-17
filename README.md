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
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes)
pnpm build
pnpm format       # Prettier
```

CI runs format check, lint, typecheck and build on every pull request.
