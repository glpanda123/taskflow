# TaskFlow API

NestJS + Prisma + PostgreSQL, built test-first against the OpenAPI contract in `packages/api-contract`. Design: [`docs/architecture`](../../docs/architecture).

## Run the tests

Needs a local Postgres 16 with a `taskflow` role (password `taskflow`) that owns a `taskflow_test` database:

```bash
pnpm --filter @taskflow/api exec prisma generate
pnpm --filter @taskflow/api test        # applies migrations, then runs the e2e tests
```

## Run the server

```bash
cp apps/api/.env.example apps/api/.env   # then edit
pnpm --filter @taskflow/api exec prisma migrate deploy
pnpm --filter @taskflow/api dev          # builds, then serves on http://localhost:3001/api/v1
```

`start` and `dev` read `apps/api/.env` themselves (Node's `--env-file-if-exists`).

## Run the web app on the real API

The web app calls `/api/v1` on its own origin. With `API_URL` set, Next forwards those
requests to the API, so the browser sees one site: the `SameSite=Strict` refresh cookie
works and no CORS is needed.

```bash
pnpm --filter @taskflow/api dev                     # terminal 1
cd apps/web
NEXT_PUBLIC_API_MOCKING=disabled API_URL=http://localhost:3001 pnpm dev   # terminal 2
```

Or put both variables in `apps/web/.env.local` (see `apps/web/.env.example`). Screens whose
endpoint the API doesn't have yet (Today, Members, Activity, AI drafts, realtime) show
"Coming soon" instead of data.

## What exists so far

| Area       | Endpoints                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| Auth       | `POST /api/v1/auth/register`, `login`, `refresh` (rotation + reuse detection), `logout`                    |
| Me         | `GET /api/v1/me`                                                                                           |
| Workspaces | `POST /api/v1/workspaces`                                                                                  |
| Projects   | `GET`/`POST /api/v1/workspaces/{id}/projects`                                                              |
| Tasks      | `GET`/`POST /api/v1/projects/{id}/tasks`, `GET`/`PATCH /api/v1/tasks/{id}`, `POST /api/v1/tasks/{id}/move` |
