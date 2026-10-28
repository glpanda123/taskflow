# ADR-001: Backend stack

- Status: Accepted (Stage 3, 2026-10-28)
- Context docs: [01 — containers](../01-context-and-containers.md), [02 — data model](../02-data-model.md), [03 — sequences](../03-sequences.md)

## Context

The backend must serve the existing OpenAPI contract and the realtime protocol, enforce roles and tenant isolation, run a worker, and be built test-first in about five sessions by one developer whose strongest language is TypeScript. It is also a portfolio piece: the stack should match what Hanoi job posts ask for.

## Decision

| Concern            | Choice                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Language / runtime | TypeScript on Node 22 (same language as the web app; shares the generated contract types)                                                                                                     |
| Framework          | **NestJS**: modules, dependency injection, guards for auth and roles, WebSocket gateways, one codebase built as two apps (`api`, `worker`)                                                    |
| Database access    | **Prisma** for schema, migrations and most queries; raw SQL (`$queryRaw`) where precision matters (outbox claim with `SKIP LOCKED`, partial indexes, `COLLATE "C"` edited into the migration) |
| Validation         | Request bodies validated against the **OpenAPI schemas** (Ajv), so the contract stays the single source of truth instead of duplicating rules in DTO classes                                  |
| Auth               | argon2id for passwords; JWT access tokens (15 min) via `jose`; refresh tokens as hashed rows with rotation and family revocation                                                              |
| Realtime           | NestJS gateway on the plain `ws` adapter (the client uses the browser's native WebSocket); Redis pub/sub via `ioredis`                                                                        |
| Jobs               | BullMQ on Redis (invitation emails, retries with backoff); outbox relay as a polling loop in the worker                                                                                       |
| Tests              | Vitest; integration tests against a **real Postgres and Redis in containers** (Testcontainers), including tenant-isolation tests that try to read another workspace's data                    |

## Options considered

| Option                              | For                                                                                                                            | Against                                                                                                 | Verdict                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **NestJS**                          | Structure out of the box; guards map directly to RBAC; first-class WebSockets and testing; very common in Vietnamese job posts | Decorator-heavy; more boilerplate than a minimal framework                                              | **Chosen**                                                                |
| Express or Fastify, hand-structured | Small, explicit, fast                                                                                                          | I'd design the module system, DI and testing setup myself; easy to get inconsistent under time pressure | Rejected for this timeline                                                |
| Hono                                | Very light, modern, runs on edge                                                                                               | Smaller ecosystem for WebSockets, queues, DI; less common in job posts                                  | Rejected                                                                  |
| **Prisma**                          | Typed client, readable schema, migrations, widely known                                                                        | Generated SQL can be opaque; some Postgres features need raw SQL                                        | **Chosen**, with raw SQL where needed                                     |
| Drizzle / Kysely                    | Closer to SQL, full control, lighter                                                                                           | More hand-written queries; fewer teammates know them                                                    | Good alternative; revisit if Prisma fights the outbox or ordering queries |
| TypeORM                             | Classic NestJS pairing                                                                                                         | Weaker type safety; known migration pain                                                                | Rejected                                                                  |
| class-validator DTOs                | NestJS default                                                                                                                 | Duplicates every rule already in `openapi.yaml`; the two drift                                          | Rejected in favour of contract validation                                 |

## Consequences

- One language end to end; the web app and the API import the same generated types, so a contract change breaks the build on both sides.
- The optimistic-lock write stays a single statement: `updateMany({ where: { id, version }, data: { …, version: { increment: 1 } } })` and a count of 0 means 409.
- Raw SQL appears in a few known places; each gets an integration test against real Postgres.
- NestJS adds boilerplate that the AI assistant can generate; the rules inside guards and services are written by hand, test first.
- If WebSocket load ever competes with REST, the gateway module can move into its own app without changing the protocol.
