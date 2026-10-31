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
pnpm --filter @taskflow/api build && pnpm --filter @taskflow/api start
```

## What exists so far

| Area | Endpoints                                                                               |
| ---- | --------------------------------------------------------------------------------------- |
| Auth | `POST /api/v1/auth/register`, `login`, `refresh` (rotation + reuse detection), `logout` |
| Me   | `GET /api/v1/me`                                                                        |
